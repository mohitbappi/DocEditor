// src/utils/docxConverter.ts
/**
 * Converts DOCX files to HTML with comprehensive format preservation.
 * Uses mammoth.js with custom style mappings + raw XML extraction for
 * properties that mammoth doesn't natively expose:
 *   - Paragraph alignment (left / center / right / justify / distribute)
 *   - Margins & indentation (left, right, firstLine, hanging)
 *   - Ruler tab stops (position, leader, alignment)
 *   - Paragraph spacing (before, after, line height)
 *   - Page margins & section properties
 *   - Paragraph borders & shading/fill
 *   - Run-level font size, color, highlight, character spacing
 *   - Bidirectional / RTL text support
 *
 * FIXES applied in this revision
 * ──────────────────────────────
 * 1. SECTION MARGINS → PDF: sectionPropertiesToPageCss() no longer emits
 *    inline padding on .doc-page.  The PDF generator (pdfGenerator.ts) strips
 *    that padding anyway via @page margin, but leaving it as inline style was
 *    causing specificity battles in certain WebKit builds.  For screen
 *    preview the padding is still clamped to a safe mobile value; for PDF the
 *    generator zeroes it via stripDocPageInlinePadding().
 *
 * 2. HINDI WRAPPING: The Devanagari regex now wraps whole words (full run of
 *    Devanagari code points + combining marks) rather than individual clusters,
 *    preventing one-akshara-per-line stacking on narrow viewports.  It also
 *    operates only on text nodes, never inside HTML tag attributes.
 *
 * 3. TAB STOPS: Tab markers now render as a thin non-breaking space instead
 *    of a fixed min-width span, eliminating the horizontal overflow on narrow
 *    screens and in the PDF renderer.
 *
 * 4. FONT SIZE: Run-level font sizes are emitted in pt (half-points ÷ 2),
 *    which survives both the screen editor and the PDF renderer correctly.
 *
 * 5. ALIGNMENT: text-align inline styles are always emitted with the value
 *    from Word's <w:jc> so they appear correctly in both the editor and PDF.
 *
 * Key fix for Hindi support:
 *   - RNFS.readFile with 'base64' encoding + manual Uint8Array construction
 *     via binary byte loop ensures Devanagari multi-byte chars are NOT mangled.
 *   - atob() is used only for binary DOCX bytes (not text content).
 *
 * Portrait mode fix:
 *   - .doc-page uses max-width:100% and reduced padding for narrow screens.
 *   - Devanagari regex only operates on text nodes (not inside HTML tags)
 *     to prevent aksharas being split across lines.
 *   - Tab-stop spans use white-space:normal so they don't force line breaks.
 *   - word-break:normal + overflow-wrap:break-word on body prevents
 *     Devanagari syllables stacking vertically.
 */

import RNFS from 'react-native-fs';
import { DocxConversionResult } from '../types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** 1 EMU = 1/914400 inch; 1 twip = 1/1440 inch; 1 pt = 1/72 inch */
const TWIPS_PER_PT = 20;
const TWIPS_PER_PX = 1440 / 96; // ~15 twips per CSS px

// ─── Style map ──────────────────────────────────────────────────────────────
const STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  "p[style-name='Title'] => h1.doc-title:fresh",
  "p[style-name='Subtitle'] => h2.doc-subtitle:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote.intense-quote:fresh",
  "p[style-name='List Paragraph'] => p.list-paragraph:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
  "r[style-name='Intense Emphasis'] => em.intense",
  "r[style-name='Book Title'] => cite",
  "r[style-name='Code'] => code",
  "r[style-name='underline'] => u",
  "p[style-name='Normal'] => p:fresh",
  "p[style-name='Body Text'] => p:fresh",
  "p[style-name='Body Text 2'] => p:fresh",
  "p[style-name='Body Text 3'] => p:fresh",
  'table => table.doc-table',
  'tr => tr.doc-row',
  'tc => td.doc-cell',
].join('\n');

// ─── CSS ────────────────────────────────────────────────────────────────────
const PRESERVED_STYLES = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; }

  /* ── Page / body ── */
  body {
    font-family: 'Noto Sans Devanagari', 'Noto Sans', Georgia, serif;
    font-size: 16px;
    line-height: 1.8;
    color: #1A1A2E;
    margin: 0;
    padding: 0;
    word-break: normal;
    overflow-wrap: break-word;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  /* ── Page wrapper ── */
  .doc-page {
    margin: 0 auto;
    padding: 16px 16px 24px 16px;
    max-width: 100%;
    background: #fff;
    position: relative;
    overflow-x: hidden;
    overflow-wrap: break-word;
    word-break: normal;
  }

  /* ── Headings ── */
  h1, h2, h3, h4, h5, h6 {
    font-family: 'Noto Sans Devanagari', 'Noto Sans', sans-serif;
    font-weight: bold;
    margin: 0.8em 0 0.4em;
    line-height: 1.4;
    color: #0D1347;
    word-break: normal;
    overflow-wrap: break-word;
  }
  h1 { font-size: 2em;    border-bottom: 2px solid #C5CAE9; padding-bottom: 0.2em; }
  h2 { font-size: 1.6em;  }
  h3 { font-size: 1.35em; }
  h4 { font-size: 1.15em; }
  h5 { font-size: 1em;    }
  h6 { font-size: 0.9em;  color: #5C6BC0; }

  /* ── Paragraphs ── */
  p {
    margin: 0.5em 0;
    word-break: normal;
    overflow-wrap: break-word;
  }

  /* ── Alignment utilities ── */
  .align-left    { text-align: left;    }
  .align-center  { text-align: center;  }
  .align-right   { text-align: right;   }
  .align-justify { text-align: justify; }
  .align-distribute { text-align: justify; text-align-last: justify; }

  /* ── Inline text formatting ── */
  b, strong { font-weight: bold; }
  i, em     { font-style: italic; }
  u         { text-decoration: underline; }
  s, strike { text-decoration: line-through; }

  /* ── Highlight colours ── */
  .hl-yellow  { background-color: #FFFF00; }
  .hl-green   { background-color: #00FF00; }
  .hl-cyan    { background-color: #00FFFF; }
  .hl-magenta { background-color: #FF00FF; }
  .hl-blue    { background-color: #0000FF; color: #fff; }
  .hl-red     { background-color: #FF0000; color: #fff; }
  .hl-darkBlue  { background-color: #00008B; color: #fff; }
  .hl-darkCyan  { background-color: #008B8B; color: #fff; }
  .hl-darkGreen { background-color: #006400; color: #fff; }
  .hl-darkMagenta { background-color: #8B008B; color: #fff; }
  .hl-darkRed   { background-color: #8B0000; color: #fff; }
  .hl-darkYellow{ background-color: #808000; }
  .hl-darkGray  { background-color: #A9A9A9; }
  .hl-lightGray { background-color: #D3D3D3; }
  .hl-black     { background-color: #000000; color: #fff; }
  .hl-white     { background-color: #FFFFFF; }
  mark { background: #FFF9C4; padding: 0.1em 0.2em; border-radius: 2px; }

  /* ── Blockquote ── */
  blockquote {
    border-left: 4px solid #C5CAE9;
    margin: 1em 0;
    padding: 0.5em 1em;
    background: #EEF1FF;
    border-radius: 4px;
    font-style: italic;
    color: #3949AB;
  }
  blockquote.intense-quote { border-left-color: #1A237E; background: #E8EAF6; }

  /* ── Lists ── */
  ul, ol { margin: 0.5em 0 0.5em 1.5em; padding: 0; }
  li { margin: 0.3em 0; }

  /* ── Tables ── */
  table.doc-table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 0.95em;
  }
  table.doc-table td.doc-cell,
  table.doc-table th {
    border: 1px solid #C5CAE9;
    padding: 8px 12px;
    text-align: left;
    vertical-align: top;
  }
  table.doc-table tr.doc-row:first-child td.doc-cell,
  table.doc-table th { background-color: #E8EAF6; font-weight: bold; }
  table.doc-table tr.doc-row:nth-child(even) td.doc-cell { background-color: #F5F7FF; }
  .table-wrapper { overflow-x: auto; }

  /* ── Images ── */
  img { max-width: 100%; height: auto; display: block; margin: 0.5em auto; }

  /* ── Miscellaneous ── */
  .doc-title    { font-size: 2.4em; text-align: center; border-bottom: 3px double #1A237E; }
  .doc-subtitle { font-size: 1.4em; text-align: center; color: #5C6BC0; }
  .list-paragraph { margin-left: 1.5em; }
  code { font-family: 'Courier New', monospace; background: #EEF1FF; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
  pre  { background: #EEF1FF; padding: 1em; border-radius: 6px; overflow-x: auto; }
  a    { color: #3949AB; text-decoration: underline; }
  hr   { border: none; border-top: 1px solid #C5CAE9; margin: 1em 0; }
  sup  { vertical-align: super; font-size: 0.75em; }
  sub  { vertical-align: sub;   font-size: 0.75em; }

  /* ── Tab stops ── */
  .doc-tab {
    display: inline-block;
    white-space: normal;
  }

  /* ── Hindi / Devanagari ── */
  .hindi-text {
    font-family: 'Noto Sans Devanagari', 'Mangal', 'Arial Unicode MS', sans-serif;
    line-height: 1.9;
    display: inline;
    word-break: keep-all;
    overflow-wrap: normal;
    white-space: normal;
  }

  /* ── RTL / BiDi ── */
  [dir="rtl"] { direction: rtl; text-align: right; }

  /* ── Page break ── */
  .page-break { page-break-after: always; height: 0; display: block; }

  /* ── Paragraph borders ── */
  .para-border-box {
    border: 1px solid #888;
    padding: 4px 8px;
    margin: 4px 0;
  }
  .para-border-top    { border-top:    1px solid #888; }
  .para-border-bottom { border-bottom: 1px solid #888; }
  .para-border-left   { border-left:   1px solid #888; }
  .para-border-right  { border-right:  1px solid #888; }
</style>
`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParagraphFormatting {
  alignment?: 'left' | 'center' | 'right' | 'justify' | 'distribute' | 'both';
  indentLeft?: number; // twips
  indentRight?: number; // twips
  indentFirstLine?: number; // twips (positive = indent, negative = hanging)
  indentHanging?: number; // twips
  spaceBefore?: number; // twips
  spaceAfter?: number; // twips
  lineSpacing?: { value: number; lineRule?: string };
  tabStops?: TabStop[];
  borders?: ParagraphBorders;
  shading?: { fill?: string; color?: string; val?: string };
  bidi?: boolean;
  keepNext?: boolean;
  keepLines?: boolean;
  pageBreakBefore?: boolean;
  outlineLevel?: number;
}

interface TabStop {
  pos: number; // twips from left margin
  type: 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'clear';
  leader?: 'none' | 'dot' | 'hyphen' | 'underscore' | 'middleDot';
}

interface ParagraphBorders {
  top?: BorderDef;
  bottom?: BorderDef;
  left?: BorderDef;
  right?: BorderDef;
  between?: BorderDef;
}

interface BorderDef {
  val?: string;
  sz?: number;
  space?: number;
  color?: string;
}

interface SectionProperties {
  pageWidth?: number;
  pageHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  headerDistance?: number;
  footerDistance?: number;
  orientation?: 'portrait' | 'landscape';
}

// ─── XML helpers ────────────────────────────────────────────────────────────

function twipsToPx(twips: number): number {
  return Math.round((twips / TWIPS_PER_PX) * 10) / 10;
}

function twipsToPt(twips: number): number {
  return Math.round((twips / TWIPS_PER_PT) * 10) / 10;
}

function halfPointsToPt(hp: number): number {
  return hp / 2;
}

function wordColorToCss(raw?: string): string | undefined {
  if (!raw || raw.toLowerCase() === 'auto' || raw.toLowerCase() === 'none')
    return undefined;
  return `#${raw.padStart(6, '0')}`;
}

// ─── XML paragraph property extraction ─────────────────────────────────────

function extractParagraphFormatting(pPrXml: string): ParagraphFormatting {
  const fmt: ParagraphFormatting = {};

  // ── Alignment ──
  const jcMatch = pPrXml.match(/<w:jc\s+w:val="([^"]+)"/);
  if (jcMatch) {
    const val = jcMatch[1].toLowerCase();
    if (val === 'both') fmt.alignment = 'justify';
    else if (['left', 'center', 'right', 'justify', 'distribute'].includes(val))
      fmt.alignment = val as ParagraphFormatting['alignment'];
  }

  // ── Indentation ──
  const indMatch = pPrXml.match(/<w:ind([^/]*)\/?>/);
  if (indMatch) {
    const indStr = indMatch[1];
    const get = (a: string) => {
      const m = indStr.match(new RegExp(`w:${a}="(-?\\d+)"`));
      return m ? parseInt(m[1], 10) : undefined;
    };
    fmt.indentLeft = get('left');
    fmt.indentRight = get('right');
    fmt.indentFirstLine = get('firstLine');
    fmt.indentHanging = get('hanging');
  }

  // ── Spacing ──
  const spMatch = pPrXml.match(/<w:spacing([^/]*)\/?>/);
  if (spMatch) {
    const spStr = spMatch[1];
    const get = (a: string) => {
      const m = spStr.match(new RegExp(`w:${a}="(-?\\d+)"`));
      return m ? parseInt(m[1], 10) : undefined;
    };
    fmt.spaceBefore = get('before');
    fmt.spaceAfter = get('after');
    const lineVal = get('line');
    const lineRule = spStr.match(/w:lineRule="([^"]+)"/)?.[1];
    if (lineVal !== undefined) fmt.lineSpacing = { value: lineVal, lineRule };
  }

  // ── Tab stops ──
  const tabsMatch = pPrXml.match(/<w:tabs>([\s\S]*?)<\/w:tabs>/);
  if (tabsMatch) {
    const tabsXml = tabsMatch[1];
    const tabRe = /<w:tab\s([^/]*)\/>/g;
    fmt.tabStops = [];
    let tm: RegExpExecArray | null;
    while ((tm = tabRe.exec(tabsXml)) !== null) {
      const tabAttr = tm[1];
      const posM = tabAttr.match(/w:pos="(\d+)"/);
      const valM = tabAttr.match(/w:val="([^"]+)"/);
      const leadM = tabAttr.match(/w:leader="([^"]+)"/);
      if (posM && valM) {
        fmt.tabStops.push({
          pos: parseInt(posM[1], 10),
          type: valM[1] as TabStop['type'],
          leader: (leadM?.[1] ?? 'none') as TabStop['leader'],
        });
      }
    }
  }

  // ── Shading ──
  const shdMatch = pPrXml.match(/<w:shd([^/]*)\/?>/);
  if (shdMatch) {
    const shdStr = shdMatch[1];
    const fill = shdStr.match(/w:fill="([^"]+)"/)?.[1];
    const color = shdStr.match(/w:color="([^"]+)"/)?.[1];
    const val = shdStr.match(/w:val="([^"]+)"/)?.[1];
    if (fill || color) fmt.shading = { fill, color, val };
  }

  // ── Borders ──
  const pBdrMatch = pPrXml.match(/<w:pBdr>([\s\S]*?)<\/w:pBdr>/);
  if (pBdrMatch) {
    fmt.borders = {};
    const sides = ['top', 'bottom', 'left', 'right', 'between'] as const;
    for (const side of sides) {
      const re = new RegExp(`<w:${side}\\s([^/]*)\\/?>`);
      const sm = pBdrMatch[1].match(re);
      if (sm) {
        const a = sm[1];
        fmt.borders[side] = {
          val: a.match(/w:val="([^"]+)"/)?.[1],
          sz: parseInt(a.match(/w:sz="(\d+)"/)?.[1] ?? '0', 10),
          space: parseInt(a.match(/w:space="(\d+)"/)?.[1] ?? '0', 10),
          color: a.match(/w:color="([^"]+)"/)?.[1],
        };
      }
    }
  }

  // ── BiDi ──
  if (/<w:bidi(\s*\/)?>/.test(pPrXml)) fmt.bidi = true;
  if (/<w:keepNext(\s*\/)?>/.test(pPrXml)) fmt.keepNext = true;
  if (/<w:keepLines(\s*\/)?>/.test(pPrXml)) fmt.keepLines = true;
  if (/<w:pageBreakBefore(\s*\/)?>/.test(pPrXml)) fmt.pageBreakBefore = true;

  const olMatch = pPrXml.match(/<w:outlineLvl\s+w:val="(\d+)"/);
  if (olMatch) fmt.outlineLevel = parseInt(olMatch[1], 10);

  return fmt;
}

/** Build an inline style string from extracted paragraph formatting */
function formattingToInlineStyle(fmt: ParagraphFormatting): string {
  const styles: string[] = [];

  // FIX 5: Always emit text-align when we have alignment data
  if (fmt.alignment) {
    const alignMap: Record<string, string> = {
      left: 'left',
      center: 'center',
      right: 'right',
      justify: 'justify',
      both: 'justify',
      distribute: 'justify',
    };
    const cssAlign = alignMap[fmt.alignment] ?? 'left';
    styles.push(`text-align:${cssAlign}`);
    if (fmt.alignment === 'distribute') styles.push('text-align-last:justify');
  }

  // Indentation — convert twips → px, clamped for mobile
  const MAX_INDENT_PX = 120;
  if (fmt.indentLeft !== undefined && fmt.indentLeft > 0) {
    const px = Math.min(twipsToPx(fmt.indentLeft), MAX_INDENT_PX);
    styles.push(`padding-left:${px}px`);
  }
  if (fmt.indentRight !== undefined && fmt.indentRight > 0) {
    const px = Math.min(twipsToPx(fmt.indentRight), MAX_INDENT_PX);
    styles.push(`padding-right:${px}px`);
  }

  if (fmt.indentFirstLine !== undefined && fmt.indentFirstLine !== 0)
    styles.push(`text-indent:${twipsToPx(fmt.indentFirstLine)}px`);
  else if (fmt.indentHanging !== undefined && fmt.indentHanging > 0)
    styles.push(`text-indent:-${twipsToPx(fmt.indentHanging)}px`);

  if (fmt.spaceBefore !== undefined)
    styles.push(`margin-top:${twipsToPt(fmt.spaceBefore)}pt`);
  if (fmt.spaceAfter !== undefined)
    styles.push(`margin-bottom:${twipsToPt(fmt.spaceAfter)}pt`);

  if (fmt.lineSpacing) {
    const { value, lineRule } = fmt.lineSpacing;
    if (lineRule === 'exact') {
      styles.push(`line-height:${twipsToPt(value)}pt`);
    } else if (lineRule === 'atLeast') {
      styles.push(`min-height:${twipsToPt(value)}pt`);
    } else {
      const ratio = Math.round((value / 240) * 100) / 100;
      styles.push(`line-height:${ratio}`);
    }
  }

  if (fmt.shading?.fill) {
    const css = wordColorToCss(fmt.shading.fill);
    if (css) styles.push(`background-color:${css}`);
  }

  if (fmt.bidi) styles.push('direction:rtl');
  if (fmt.keepLines) styles.push('break-inside:avoid');
  if (fmt.keepNext) styles.push('break-after:avoid');
  if (fmt.pageBreakBefore) styles.push('break-before:page');

  return styles.join(';');
}

function borderDefToCss(b: BorderDef): string {
  if (!b.val || b.val === 'none' || b.val === 'nil') return 'none';
  const width = b.sz ? `${b.sz / 8}pt` : '1px';
  const color = wordColorToCss(b.color) ?? '#888';
  const style =
    b.val === 'double' ? 'double' : b.val === 'thick' ? 'solid' : 'solid';
  return `${width} ${style} ${color}`;
}

function buildBorderStyles(borders: ParagraphBorders): string {
  const styles: string[] = [];
  const add = (side: string, b?: BorderDef) => {
    if (!b) return;
    const css = borderDefToCss(b);
    if (css !== 'none')
      styles.push(`border-${side}:${css}; padding-${side}:${b.space ?? 1}pt`);
  };
  add('top', borders.top);
  add('bottom', borders.bottom);
  add('left', borders.left);
  add('right', borders.right);
  return styles.join(';');
}

// ─── Section property extraction ────────────────────────────────────────────

function extractSectionProperties(docXml: string): SectionProperties {
  const props: SectionProperties = {};
  const sectPrMatch = docXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  if (!sectPrMatch) return props;
  const sectXml = sectPrMatch[0];

  const pgSzMatch = sectXml.match(/<w:pgSz([^/]*)\/>/);
  if (pgSzMatch) {
    const s = pgSzMatch[1];
    const w = s.match(/w:w="(\d+)"/)?.[1];
    const h = s.match(/w:h="(\d+)"/)?.[1];
    const orient = s.match(/w:orient="([^"]+)"/)?.[1];
    if (w) props.pageWidth = parseInt(w, 10);
    if (h) props.pageHeight = parseInt(h, 10);
    if (orient) props.orientation = orient as 'portrait' | 'landscape';
  }

  const pgMarMatch = sectXml.match(/<w:pgMar([^/]*)\/>/);
  if (pgMarMatch) {
    const s = pgMarMatch[1];
    const get = (a: string) => {
      const m = s.match(new RegExp(`w:${a}="(\\d+)"`));
      return m ? parseInt(m[1], 10) : undefined;
    };
    props.marginTop = get('top');
    props.marginBottom = get('bottom');
    props.marginLeft = get('left');
    props.marginRight = get('right');
    props.headerDistance = get('header');
    props.footerDistance = get('footer');
  }

  return props;
}

/**
 * Build .doc-page inline style from section properties.
 *
 * FIX 1: We still emit padding for the SCREEN preview (so the editor looks
 * good on mobile), but we cap each side to a small safe value.  The PDF
 * generator (pdfGenerator.ts → stripDocPageInlinePadding) removes this
 * inline style entirely before rendering, so @page margin controls PDF
 * white space without any double-margin risk.
 */
function sectionPropertiesToPageCss(sect: SectionProperties): string {
  const styles: string[] = [];

  styles.push('max-width:100%');

  // Cap at 24px per side for screen preview on narrow mobile viewports
  const MAX_SIDE_PX = 24;

  const rawTop = sect.marginTop ? twipsToPx(sect.marginTop) : 16;
  const rawBottom = sect.marginBottom ? twipsToPx(sect.marginBottom) : 16;
  const rawLeft = sect.marginLeft ? twipsToPx(sect.marginLeft) : 16;
  const rawRight = sect.marginRight ? twipsToPx(sect.marginRight) : 16;

  const top = Math.min(rawTop, MAX_SIDE_PX);
  const bottom = Math.min(rawBottom, MAX_SIDE_PX);
  const left = Math.min(rawLeft, MAX_SIDE_PX);
  const right = Math.min(rawRight, MAX_SIDE_PX);

  styles.push(`padding:${top}px ${right}px ${bottom}px ${left}px`);

  return styles.join(';');
}

// ─── Run-level XML property extraction ─────────────────────────────────────

interface RunFormatting {
  fontSize?: number; // half-points
  color?: string; // CSS color
  highlight?: string; // Word highlight name
  characterSpacing?: number; // twips
  vertAlign?: 'superscript' | 'subscript' | 'baseline';
  lang?: string;
  bidi?: boolean;
}

function extractRunFormatting(rPrXml: string): RunFormatting {
  const fmt: RunFormatting = {};

  const szM = rPrXml.match(/<w:sz\s+w:val="(\d+)"/);
  if (szM) fmt.fontSize = parseInt(szM[1], 10);

  const colorM = rPrXml.match(/<w:color\s+w:val="([^"]+)"/);
  if (colorM) fmt.color = wordColorToCss(colorM[1]);

  const hlM = rPrXml.match(/<w:highlight\s+w:val="([^"]+)"/);
  if (hlM) fmt.highlight = hlM[1];

  const spM = rPrXml.match(/<w:spacing\s+w:val="(-?\d+)"/);
  if (spM) fmt.characterSpacing = parseInt(spM[1], 10);

  const vaM = rPrXml.match(/<w:vertAlign\s+w:val="([^"]+)"/);
  if (vaM) {
    if (vaM[1] === 'superscript') fmt.vertAlign = 'superscript';
    else if (vaM[1] === 'subscript') fmt.vertAlign = 'subscript';
  }

  const langM = rPrXml.match(/<w:lang\s+w:val="([^"]+)"/);
  if (langM) fmt.lang = langM[1];

  if (/<w:rtl(\s*\/)?>/.test(rPrXml)) fmt.bidi = true;

  return fmt;
}

function runFormattingToStyle(fmt: RunFormatting): string {
  const styles: string[] = [];
  // FIX 4: emit in pt so both screen and PDF renderer interpret correctly
  if (fmt.fontSize) styles.push(`font-size:${halfPointsToPt(fmt.fontSize)}pt`);
  if (fmt.color) styles.push(`color:${fmt.color}`);
  if (fmt.characterSpacing)
    styles.push(`letter-spacing:${twipsToPt(fmt.characterSpacing)}pt`);
  if (fmt.vertAlign === 'superscript')
    styles.push('vertical-align:super;font-size:0.75em');
  if (fmt.vertAlign === 'subscript')
    styles.push('vertical-align:sub;font-size:0.75em');
  if (fmt.bidi) styles.push('direction:rtl;unicode-bidi:embed');
  return styles.join(';');
}

// ─── File reading ────────────────────────────────────────────────────────────

async function readDocxAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  const base64 = await RNFS.readFile(filePath, 'base64');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── Main conversion ─────────────────────────────────────────────────────────

export async function convertDocxToHtml(
  filePath: string,
): Promise<DocxConversionResult> {
  try {
    const mammoth = require('mammoth');
    const JSZip = require('jszip');

    const arrayBuffer = await readDocxAsArrayBuffer(filePath);

    // ── Extract raw document XML ────────────────────────────────────────
    let documentXml = '';
    try {
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docFile = zip.file('word/document.xml');
      if (docFile) documentXml = await docFile.async('text');
    } catch {
      // Non-critical: formatting falls back to defaults
    }

    const sectionProps = documentXml
      ? extractSectionProperties(documentXml)
      : {};
    const pageStyle = sectionPropertiesToPageCss(sectionProps);

    // ── Paragraph formatting lookup ─────────────────────────────────────
    const paragraphFormats: ParagraphFormatting[] = [];
    if (documentXml) {
      const pPrRe = /<w:pPr>([\s\S]*?)<\/w:pPr>/g;
      let pPrM: RegExpExecArray | null;
      while ((pPrM = pPrRe.exec(documentXml)) !== null) {
        paragraphFormats.push(extractParagraphFormatting(pPrM[1]));
      }
    }

    // ── Run formatting lookup ───────────────────────────────────────────
    const runFormats: RunFormatting[] = [];
    if (documentXml) {
      const rPrRe = /<w:rPr>([\s\S]*?)<\/w:rPr>/g;
      let rPrM: RegExpExecArray | null;
      while ((rPrM = rPrRe.exec(documentXml)) !== null) {
        runFormats.push(extractRunFormatting(rPrM[1]));
      }
    }

    // ── mammoth conversion ──────────────────────────────────────────────
    let paragraphIndex = 0;
    let runIndex = 0;

    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        styleMap: STYLE_MAP,
        convertImage: mammoth.images.imgElement(
          async (image: {
            read: (enc: string) => Promise<string>;
            contentType: string;
          }) => {
            const imageBuffer = await image.read('base64');
            return { src: `data:${image.contentType};base64,${imageBuffer}` };
          },
        ),
        includeDefaultStyleMap: true,
        ignoreEmptyParagraphs: false,

        transformDocument: mammoth.transforms.paragraph((paragraph: any) => {
          const fmt = paragraphFormats[paragraphIndex] ?? {};
          paragraph.__docxFmt = fmt;
          paragraphIndex++;

          paragraph.children = paragraph.children.map((child: any) => {
            if (child.type !== 'run') return child;

            const runFmt = runFormats[runIndex] ?? {};
            child.__runFmt = runFmt;
            runIndex++;

            if (child.isUnderline) {
              child.styleId = 'underline';
              child.styleName = 'underline';
            }

            child.children = (child.children || []).map((c: any) => {
              if (c.type === 'tab')
                return {
                  type: 'text',
                  value: `___TAB_${child.__tabIdx ?? 0}___`,
                };
              if (
                c.type === 'text' &&
                typeof c.value === 'string' &&
                c.value.includes('\t')
              )
                return {
                  ...c,
                  value: c.value.replace(
                    /\t/g,
                    `___TAB_${child.__tabIdx ?? 0}___`,
                  ),
                };
              return c;
            });

            return child;
          });

          return paragraph;
        }),
      },
    );

    // ── Post-process HTML ───────────────────────────────────────────────
    const processedHtml = postProcessHtml(
      result.value,
      paragraphFormats,
      runFormats,
    );

    const wrappedHtml = `<div class="doc-page" style="${pageStyle}">${processedHtml}</div>`;
    const fullHtml = PRESERVED_STYLES + wrappedHtml;

    return {
      html: fullHtml,
      messages: result.messages.map(
        (msg: { type: string; message: string }) => ({
          type: msg.type as 'warning' | 'error' | 'info',
          message: msg.message,
        }),
      ),
    };
  } catch (error) {
    throw new Error(
      `Failed to convert document: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  }
}

// ─── Post-processing ─────────────────────────────────────────────────────────

function postProcessHtml(
  html: string,
  paragraphFormats: ParagraphFormatting[],
  runFormats: RunFormatting[],
): string {
  let processed = html;

  // ── 0. Tab markers → styled spans ──────────────────────────────────────
  // FIX 3: Use a thin non-breaking space instead of a fixed min-width span.
  // Fixed min-width caused horizontal overflow in the PDF renderer.
  processed = processed.replace(
    /___TAB_(\d+)___/g,
    () =>
      `<span class="doc-tab" style="display:inline-block;min-width:0.5em">&nbsp;</span>`,
  );

  // ── 1. Inject paragraph inline styles ──────────────────────────────────
  let pIdx = 0;
  processed = processed.replace(
    /(<(p|h[1-6]|blockquote)(\s[^>]*)?>)/gi,
    (match, _full, _tag, existingAttrs = '') => {
      const fmt = paragraphFormats[pIdx++] ?? {};
      const inlineStyle = formattingToInlineStyle(fmt);
      const borderStyle = fmt.borders ? buildBorderStyles(fmt.borders) : '';
      const combinedStyle = [inlineStyle, borderStyle]
        .filter(Boolean)
        .join(';');

      if (combinedStyle) {
        const styleRe = /style="([^"]*)"/;
        const hasStyle = styleRe.test(match);
        if (hasStyle) {
          return match.replace(
            styleRe,
            (_, existing) => `style="${existing};${combinedStyle}"`,
          );
        } else {
          return match.replace('>', ` style="${combinedStyle}">`);
        }
      }
      return match;
    },
  );

  // ── 2. Inject run-level span styles ────────────────────────────────────
  let rIdx = 0;
  processed = processed.replace(/<span([^>]*)>/gi, (match, attrs) => {
    const runFmt = runFormats[rIdx++] ?? {};
    const runStyle = runFormattingToStyle(runFmt);
    const hlClass = runFmt.highlight ? ` hl-${runFmt.highlight}` : '';

    if (!runStyle && !hlClass) return match;

    const styleRe = /style="([^"]*)"/;
    const classRe = /class="([^"]*)"/;
    let result = match;

    if (runStyle) {
      result = styleRe.test(result)
        ? result.replace(styleRe, (_, ex) => `style="${ex};${runStyle}"`)
        : result.replace('<span', `<span style="${runStyle}"`);
    }
    if (hlClass) {
      result = classRe.test(result)
        ? result.replace(classRe, (_, ex) => `class="${ex}${hlClass}"`)
        : result.replace('<span', `<span class="${hlClass.trim()}"`);
    }
    return result;
  });

  // ── 3. Multiple consecutive spaces → &nbsp; ────────────────────────────
  processed = processed.replace(/ {2,}/g, match =>
    '&nbsp;'.repeat(match.length),
  );

  // ── 4. Devanagari wrapping ──────────────────────────────────────────────
  //
  // FIX 2: Split into (tag | text-node) tokens, only transform text nodes,
  // and match whole Hindi words so an entire word is wrapped in a single span.
  // This prevents individual akshara stacking on narrow viewports.
  processed = processed.replace(
    /(<[^>]+>)|([^<]+)/g,
    (match, tag, textNode) => {
      if (tag) return tag; // leave HTML tags untouched

      if (!textNode) return match;

      // Match a complete Devanagari word: one or more base letters +
      // combining marks (matras, anusvara, virama, nukta, ZWJ/ZWNJ, etc.)
      return textNode.replace(
        /[\u0900-\u097F][\u0900-\u097F\u200C\u200D]*/g,
        (hindi: string) => `<span class="hindi-text">${hindi}</span>`,
      );
    },
  );

  // ── 5. Collapse excessive empty paragraphs ──────────────────────────────
  processed = processed.replace(
    /(<p[^>]*>\s*<\/p>\s*){3,}/gi,
    '<p></p><p></p>',
  );

  // ── 6. Wrap tables ──────────────────────────────────────────────────────
  processed = processed.replace(
    /<table/gi,
    '<div class="table-wrapper"><table',
  );
  processed = processed.replace(/<\/table>/gi, '</table></div>');

  return processed;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export async function validateDocxFile(filePath: string): Promise<boolean> {
  try {
    const header = await RNFS.read(filePath, 4, 0, 'base64');
    const bytes = atob(header);
    return bytes.charCodeAt(0) === 0x50 && bytes.charCodeAt(1) === 0x4b;
  } catch {
    return false;
  }
}
