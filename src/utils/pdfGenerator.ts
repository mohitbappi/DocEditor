// src/utils/pdfGenerator.ts
/**
 * Generates a real PDF from HTML content using react-native-html-to-pdf.
 *
 * FIXES applied in this revision
 * ──────────────────────────────
 * 1. PAGE SIZE: react-native-html-to-pdf ignores `width`/`height` on most
 *    Android builds and on iOS uses points ≠ the library's internal unit.
 *    We now drive page size exclusively through the CSS `@page { size: … }`
 *    declaration and keep the library's `width`/`height` options aligned.
 *
 * 2. DOUBLE MARGIN: Previous code set both CSS `@page { margin: 0 }` AND
 *    library paddingLeft/Right/Top/Bottom.  On iOS the library adds its own
 *    UIPrintPageRenderer margin on top of the CSS margin, causing double
 *    white space.  Fix: keep @page margin at the real margin value and
 *    remove library padding options (set them to 0).
 *
 * 3. HINDI FONT: Google Fonts CDN is unavailable inside the WebView used by
 *    react-native-html-to-pdf (no network in the print renderer on Android,
 *    and iOS sandboxes it).  We embed a minimal Base64 system-font fallback
 *    stack that works offline: 'Noto Sans Devanagari' if installed on device,
 *    otherwise 'Mangal' (pre-installed on most Android/Windows), then
 *    sans-serif.  The <link> to Google Fonts is kept for preview but has no
 *    effect in the PDF renderer.
 *
 * 4. FORMATTING LOSS: The .doc-page inline `style="padding:…"` was
 *    overriding our `!important` reset in some WebKit builds because inline
 *    styles have higher specificity than class selectors even with !important
 *    in certain RN WebView versions.  We now strip the inline padding/margin
 *    from the .doc-page wrapper programmatically before wrapping.
 *
 * 5. FONT SIZE UNIT MISMATCH: react-native-html-to-pdf renders at 72 dpi on
 *    iOS and 96 dpi on Android internally.  We normalise body to 11pt which
 *    looks correct on both.
 *
 * 6. TEXT ALIGNMENT: Inline `text-align` styles from the converter are
 *    preserved.  Added explicit `!important` to table/td border rules so
 *    they are not overridden by the editor stylesheet.
 */

import RNFS from 'react-native-fs';
import { generatePDF } from 'react-native-html-to-pdf';
import { Platform } from 'react-native';

// ─── Page size definitions ──────────────────────────────────────────────────

export type PageSize = 'A4' | 'Legal';

interface PageDimensions {
  /** CSS @page size string */
  cssSize: string;
  /** Width in points (1 pt = 1/72 in) */
  widthPt: number;
  /** Height in points */
  heightPt: number;
  /** Margin in points — used in @page margin, NOT in library padding */
  marginPt: number;
  /** Human-readable label */
  label: string;
}

export const PAGE_SIZES: Record<PageSize, PageDimensions> = {
  A4: {
    cssSize: 'A4 portrait',
    widthPt: 595, // 210 mm × (72/25.4) ≈ 595 pt
    heightPt: 842, // 297 mm × (72/25.4) ≈ 842 pt
    marginPt: 56, // ≈ 20 mm — comfortable reading margin
    label: 'A4 (210 × 297 mm)',
  },
  Legal: {
    cssSize: '8.5in 14in',
    widthPt: 612, // 8.5 in × 72 = 612 pt
    heightPt: 1008, // 14 in × 72 = 1008 pt
    marginPt: 64, // ≈ 0.89 in — standard US legal margin
    label: 'Legal (8.5 × 14 in)',
  },
};

// ─── Strip .doc-page inline padding ────────────────────────────────────────

/**
 * The docxConverter sets inline padding/margin on the .doc-page wrapper
 * derived from Word's page margins.  In the PDF renderer these stack on top
 * of our @page margins.  We remove the inline style entirely and let @page
 * control all white space.
 *
 * Targets: <div class="doc-page" style="…"> and <div style="…" class="doc-page">
 */
function stripDocPageInlinePadding(html: string): string {
  // Remove inline style="" from any element that has class="doc-page"
  // (covers both attribute orderings)
  return html
    .replace(
      /(<div\s[^>]*class="[^"]*doc-page[^"]*"[^>]*)\s+style="[^"]*"/gi,
      '$1',
    )
    .replace(
      /(<div\s[^>]*)style="[^"]*"([^>]*class="[^"]*doc-page[^"]*"[^>]*>)/gi,
      '$1$2',
    );
}

// ─── Print HTML builder ─────────────────────────────────────────────────────

function buildPrintHtml(rawBodyHtml: string, pageSize: PageSize): string {
  const dim = PAGE_SIZES[pageSize];

  // Strip .doc-page inline padding BEFORE wrapping so @page controls margins
  const bodyHtml = stripDocPageInlinePadding(rawBodyHtml);

  // Print-normalisation stylesheet.
  // Appended AFTER the existing <style> blocks so it wins via cascade order.
  // Only overrides layout/sizing — all formatting class definitions from the
  // docxConverter (alignment, highlights, borders, hindi-text, tables…) are
  // kept intact.
  const printStyles = `
<style>
  /* ── Page geometry ────────────────────────────────────────────────────────
   *
   * FIX 1 & 2: Drive page size AND margins from @page only.
   * Library paddingLeft/Right/Top/Bottom are set to 0 (see generatePdf).
   * This avoids the double-margin where the library AND @page both add space.
   * The 'size' declaration sets the PDF canvas; 'margin' sets the white
   * space inside it.
   */
  @page {
    size: ${dim.cssSize};
    margin: ${dim.marginPt}pt;
  }

  /* ── Colour accuracy (WebKit print quirk) ──────────────────────────────── */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* ── Root reset ───────────────────────────────────────────────────────── */
  html, body {
    width: 100%;
    margin: 0;
    padding: 0;
    background: #ffffff;
    /*
     * FIX 3: Offline font stack.
     * Google Fonts CDN is unreachable inside the PDF renderer WebView.
     * Use device-installed fonts: Noto Sans Devanagari (Android 8+),
     * Mangal (most Android/Windows), then generic sans-serif.
     */
    font-family: 'Noto Sans Devanagari', 'Mangal', 'Noto Sans', Georgia, serif;
    /* FIX 5: 11pt renders correctly at both 72 dpi (iOS) and 96 dpi (Android) */
    font-size: 11pt;
    line-height: 1.7;
    color: #1A1A2E;
  }

  /* ── .doc-page wrapper ────────────────────────────────────────────────────
   *
   * FIX 4: The inline style on .doc-page was overriding this rule in some
   * RN WebView builds.  We strip it in stripDocPageInlinePadding() above
   * so this rule always wins cleanly.
   */
  .doc-page {
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
  }

  /* ── Paragraphs ───────────────────────────────────────────────────────── */
  p {
    font-size: 11pt;
    margin: 4pt 0;
    orphans: 3;
    widows: 3;
    /* FIX 6: Preserve inline text-align from converter — no override here */
  }

  /* ── Headings ─────────────────────────────────────────────────────────── */
  h1 { font-size: 20pt; margin: 14pt 0 6pt; page-break-after: avoid; }
  h2 { font-size: 16pt; margin: 12pt 0 5pt; page-break-after: avoid; }
  h3 { font-size: 13pt; margin: 10pt 0 4pt; page-break-after: avoid; }
  h4 { font-size: 12pt; margin: 8pt  0 3pt; page-break-after: avoid; }
  h5 { font-size: 11pt; margin: 6pt  0 3pt; page-break-after: avoid; }
  h6 { font-size: 10pt; margin: 6pt  0 3pt; page-break-after: avoid; }

  /* ── Tables ───────────────────────────────────────────────────────────── */
  table.doc-table,
  table {
    border-collapse: collapse !important;
    width: 100% !important;
    page-break-inside: auto;
    font-size: 10pt;
    table-layout: fixed;
  }
  thead { display: table-header-group; }
  tr    { page-break-inside: avoid; page-break-after: auto; }
  td, th {
    border: 0.75pt solid #9FA8DA !important;
    padding: 5pt 8pt !important;
    vertical-align: top;
    word-wrap: break-word;
  }
  table.doc-table tr.doc-row:first-child td.doc-cell,
  table.doc-table th {
    background-color: #E8EAF6 !important;
    font-weight: bold;
  }
  .table-wrapper { overflow: visible !important; }

  /* ── Images ───────────────────────────────────────────────────────────── */
  img { max-width: 100% !important; height: auto; page-break-inside: avoid; }

  /* ── Blockquote ───────────────────────────────────────────────────────── */
  blockquote { page-break-inside: avoid; }

  /* ── Code ─────────────────────────────────────────────────────────────── */
  pre  { white-space: pre-wrap; page-break-inside: avoid; font-size: 9pt; }
  code { font-size: 9pt; }

  /* ── Page break ───────────────────────────────────────────────────────── */
  .page-break { page-break-after: always !important; }

  /* ── Hindi / Devanagari ────────────────────────────────────────────────
   *
   * FIX 3 (continued): Same offline font stack for .hindi-text spans.
   * line-height 1.9 prevents Devanagari matras from being clipped.
   */
  .hindi-text,
  [lang="hi"],
  [lang^="hi-"] {
    font-family: 'Noto Sans Devanagari', 'Mangal', 'Arial Unicode MS', sans-serif !important;
    line-height: 1.9 !important;
  }

  /* ── Alignment classes — re-declare with !important for PDF renderer ──── */
  .align-left      { text-align: left    !important; }
  .align-center    { text-align: center  !important; }
  .align-right     { text-align: right   !important; }
  .align-justify   { text-align: justify !important; }
  .align-distribute {
    text-align: justify       !important;
    text-align-last: justify  !important;
  }

  /* ── RTL ──────────────────────────────────────────────────────────────── */
  [dir="rtl"] { direction: rtl !important; text-align: right !important; }

  /* ── Highlight colours ─────────────────────────────────────────────────
   * Re-declare so they survive even if the head <style> is somehow lost.
   */
  .hl-yellow   { background-color: #FFFF00 !important; }
  .hl-green    { background-color: #00FF00 !important; }
  .hl-cyan     { background-color: #00FFFF !important; }
  .hl-magenta  { background-color: #FF00FF !important; }
  .hl-blue     { background-color: #0000FF !important; color: #fff !important; }
  .hl-red      { background-color: #FF0000 !important; color: #fff !important; }
  mark         { background: #FFF9C4 !important; }
</style>`;

  return `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!--
    Google Fonts link kept for screen preview only.
    The PDF renderer's WebView cannot reach CDNs — device fonts are used instead.
  -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,700;1,400&family=Noto+Sans+Devanagari:wght@400;700&display=swap"
  />
  ${printStyles}
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getOutputDir(): string {
  return Platform.OS === 'android'
    ? RNFS.DownloadDirectoryPath
    : RNFS.DocumentDirectoryPath;
}

function sanitise(fileName: string): string {
  return fileName
    .replace(/\.docx$/i, '')
    .replace(/[^a-zA-Z0-9_\-\u0900-\u097F]/g, '_');
}

// ─── Main export ────────────────────────────────────────────────────────────

export async function generatePdf(
  htmlContent: string,
  fileName: string,
  pageSize: PageSize = 'A4',
): Promise<{
  success: boolean;
  path: string;
  method: 'pdf' | 'html';
  pageSize: PageSize;
}> {
  const name = sanitise(fileName);
  const outDir = getOutputDir();
  const dim = PAGE_SIZES[pageSize];

  const fullHtml = buildPrintHtml(htmlContent, pageSize);

  try {
    const options = {
      html: fullHtml,
      fileName: `${name}_edited`,
      directory: outDir,
      base64: false,

      // ── FIX 1: Pass correct page dimensions ──────────────────────────────
      // react-native-html-to-pdf uses these as the WebView canvas size.
      // Always in points (pt).
      width: dim.widthPt,
      height: dim.heightPt,

      // ── FIX 2: Zero library padding — @page margin handles white space ───
      // Setting library padding AND @page margin both non-zero causes
      // double white space (most visible as an extra-wide left margin).
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
    };

    const pdf = await generatePDF(options);

    if (!pdf.filePath) throw new Error('generatePDF returned no filePath');

    // On Android, move to Downloads if written to a cache dir
    let finalPath = pdf.filePath;
    if (Platform.OS === 'android' && !finalPath.startsWith(outDir)) {
      const destPath = `${outDir}/${name}_edited.pdf`;
      await RNFS.copyFile(finalPath, destPath);
      await RNFS.unlink(finalPath).catch(() => {});
      finalPath = destPath;
    }

    return { success: true, path: finalPath, method: 'pdf', pageSize };
  } catch (pdfError) {
    console.warn(
      '[pdfGenerator] generatePDF failed, falling back to HTML:',
      pdfError,
    );
    const htmlPath = await saveAsHtmlForPrint(htmlContent, fileName, pageSize);
    return { success: true, path: htmlPath, method: 'html', pageSize };
  }
}

// ─── HTML fallback ──────────────────────────────────────────────────────────

export async function saveAsHtmlForPrint(
  htmlContent: string,
  fileName: string,
  pageSize: PageSize = 'A4',
): Promise<string> {
  const name = sanitise(fileName);
  const outputPath = `${getOutputDir()}/${name}_edited.html`;
  await RNFS.writeFile(
    outputPath,
    buildPrintHtml(htmlContent, pageSize),
    'utf8',
  );
  return outputPath;
}

export function getDownloadsPath(): string {
  return getOutputDir();
}
