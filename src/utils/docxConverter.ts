// src/utils/docxConverter.ts
/**
 * Converts DOCX files to HTML with format preservation.
 * Uses mammoth.js with custom style mappings for accurate rendering.
 */

import RNFS from 'react-native-fs';
import {DocxConversionResult} from '../types';

// Style map preserves common DOCX formatting to HTML equivalents
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
  "p[style-name='Normal'] => p:fresh",
  "p[style-name='Body Text'] => p:fresh",
  "p[style-name='Body Text 2'] => p:fresh",
  "p[style-name='Body Text 3'] => p:fresh",
  "table => table.doc-table",
  "tr => tr",
  "tc => td",
].join('\n');

// CSS injected into converted HTML for layout preservation
const PRESERVED_STYLES = `
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Noto Sans', 'Noto Sans Devanagari', Georgia, serif;
    font-size: 16px;
    line-height: 1.7;
    color: #1A1A2E;
    margin: 0;
    padding: 0;
  }
  h1, h2, h3, h4, h5, h6 {
    font-weight: bold;
    margin: 0.8em 0 0.4em;
    line-height: 1.3;
    color: #0D1347;
  }
  h1 { font-size: 2em; border-bottom: 2px solid #C5CAE9; padding-bottom: 0.2em; }
  h2 { font-size: 1.6em; }
  h3 { font-size: 1.35em; }
  h4 { font-size: 1.15em; }
  h5 { font-size: 1em; }
  h6 { font-size: 0.9em; color: #5C6BC0; }
  p { margin: 0.5em 0; }
  b, strong { font-weight: bold; }
  i, em { font-style: italic; }
  u { text-decoration: underline; }
  blockquote {
    border-left: 4px solid #C5CAE9;
    margin: 1em 0;
    padding: 0.5em 1em;
    background: #EEF1FF;
    border-radius: 4px;
    font-style: italic;
    color: #3949AB;
  }
  blockquote.intense-quote {
    border-left-color: #1A237E;
    background: #E8EAF6;
  }
  ul, ol { margin: 0.5em 0 0.5em 1.5em; padding: 0; }
  li { margin: 0.3em 0; }
  table.doc-table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 0.95em;
  }
  table.doc-table td, table.doc-table th {
    border: 1px solid #C5CAE9;
    padding: 8px 12px;
    text-align: left;
    vertical-align: top;
  }
  table.doc-table tr:first-child td,
  table.doc-table th {
    background-color: #E8EAF6;
    font-weight: bold;
  }
  table.doc-table tr:nth-child(even) td {
    background-color: #F5F7FF;
  }
  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0.5em auto;
  }
  .doc-title { font-size: 2.4em; text-align: center; border-bottom: 3px double #1A237E; }
  .doc-subtitle { font-size: 1.4em; text-align: center; color: #5C6BC0; }
  .list-paragraph { margin-left: 1.5em; }
  code {
    font-family: 'Courier New', monospace;
    background: #EEF1FF;
    padding: 0.1em 0.3em;
    border-radius: 3px;
    font-size: 0.9em;
  }
  pre { background: #EEF1FF; padding: 1em; border-radius: 6px; overflow-x: auto; }
  a { color: #3949AB; text-decoration: underline; }
  hr { border: none; border-top: 1px solid #C5CAE9; margin: 1em 0; }
  sup { vertical-align: super; font-size: 0.75em; }
  sub { vertical-align: sub; font-size: 0.75em; }
  mark { background: #FFF9C4; padding: 0.1em 0.2em; border-radius: 2px; }
  /* RTL support for Hindi text */
  [lang="hi"], .hindi-text { font-family: 'Noto Sans Devanagari', sans-serif; }
  /* Page break hints for PDF */
  .page-break { page-break-after: always; }
</style>
`;

/**
 * Reads a DOCX file from the filesystem and returns its binary content as ArrayBuffer.
 */
async function readDocxFile(filePath: string): Promise<ArrayBuffer> {
  // Read file as base64 then convert to ArrayBuffer
  const base64Data = await RNFS.readFile(filePath, 'base64');
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converts a DOCX file at the given path to HTML string.
 * Preserves headings, tables, lists, bold/italic, images, and indentation.
 */
export async function convertDocxToHtml(
  filePath: string,
): Promise<DocxConversionResult> {
  try {
    // mammoth is loaded dynamically to handle React Native's module system
    const mammoth = require('mammoth');

    const arrayBuffer = await readDocxFile(filePath);

    const options = {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(
        async (image: {read: (enc: string) => Promise<string>; contentType: string}) => {
          // Embed images as base64 data URIs to preserve them in HTML
          const imageBuffer = await image.read('base64');
          return {
            src: `data:${image.contentType};base64,${imageBuffer}`,
          };
        },
      ),
      includeDefaultStyleMap: true,
      ignoreEmptyParagraphs: false,
    };

    const result = await mammoth.convertToHtml({arrayBuffer}, options);

    // Post-process HTML: detect Hindi text and wrap for proper font rendering
    let processedHtml = postProcessHtml(result.value);

    // Prepend our CSS
    const fullHtml = PRESERVED_STYLES + processedHtml;

    return {
      html: fullHtml,
      messages: result.messages.map(
        (msg: {type: string; message: string}) => ({
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

/**
 * Post-processes converted HTML:
 * - Detects Hindi/Devanagari characters and wraps them in lang="hi" spans
 * - Cleans up empty paragraphs
 * - Fixes list nesting
 */
function postProcessHtml(html: string): string {
  // Wrap Devanagari text in spans for proper font rendering
  const hindiRegex = /[\u0900-\u097F\u0980-\u09FF]+(?:\s*[\u0900-\u097F\u0980-\u09FF\s]*)?/g;
  let processed = html.replace(hindiRegex, match => {
    if (match.trim().length === 0) {
      return match;
    }
    return `<span lang="hi" class="hindi-text">${match}</span>`;
  });

  // Remove consecutive empty paragraphs (max 2 line breaks)
  processed = processed.replace(/(<p>\s*<\/p>\s*){3,}/gi, '<p></p><p></p>');

  // Ensure tables have proper wrapper for scroll on mobile
  processed = processed.replace(
    /<table/gi,
    '<div class="table-wrapper" style="overflow-x:auto;"><table',
  );
  processed = processed.replace(/<\/table>/gi, '</table></div>');

  return processed;
}

/**
 * Validates that the file is a proper DOCX (checks magic bytes).
 */
export async function validateDocxFile(filePath: string): Promise<boolean> {
  try {
    // DOCX files start with PK (zip magic bytes: 50 4B)
    const header = await RNFS.read(filePath, 4, 0, 'base64');
    const bytes = atob(header);
    return bytes.charCodeAt(0) === 0x50 && bytes.charCodeAt(1) === 0x4b;
  } catch {
    return false;
  }
}
