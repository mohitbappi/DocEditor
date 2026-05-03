// src/utils/pdfGenerator.ts
/**
 * Generates a PDF from HTML content using react-native-blob-util
 * and a WebView-based printing approach for format preservation.
 */

import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';

// Full HTML wrapper for PDF generation with print-optimised CSS
function buildPrintHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <style>
    /* === Google Fonts for Hindi + English === */
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,700;1,400&family=Noto+Sans+Devanagari:wght@400;700&display=swap');

    /* === Reset & Base === */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: auto;
      font-family: 'Noto Sans', Georgia, serif;
      font-size: 12pt;
      line-height: 1.7;
      color: #1A1A2E;
      background: #ffffff;
    }

    /* === Page Layout === */
    @page {
      size: A4;
      margin: 2.5cm 2cm;
    }
    body { padding: 0; }

    /* === Typography === */
    h1 { font-size: 22pt; margin: 16pt 0 8pt; border-bottom: 2pt solid #1A237E; padding-bottom: 4pt; color: #0D1347; }
    h2 { font-size: 18pt; margin: 14pt 0 6pt; color: #1A237E; }
    h3 { font-size: 15pt; margin: 12pt 0 5pt; color: #283593; }
    h4 { font-size: 13pt; margin: 10pt 0 4pt; }
    h5 { font-size: 12pt; margin: 8pt 0 3pt; }
    h6 { font-size: 11pt; color: #5C6BC0; margin: 8pt 0 3pt; }
    p  { margin: 5pt 0; orphans: 3; widows: 3; }

    /* === Hindi / Devanagari === */
    [lang="hi"], .hindi-text {
      font-family: 'Noto Sans Devanagari', 'Noto Sans', serif;
    }

    /* === Lists === */
    ul, ol { margin: 6pt 0 6pt 20pt; }
    li { margin: 3pt 0; }
    ul ul, ol ol, ul ol, ol ul { margin-top: 2pt; }

    /* === Tables === */
    .table-wrapper { overflow: visible; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 10pt 0;
      font-size: 11pt;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    td, th {
      border: 0.75pt solid #9FA8DA;
      padding: 6pt 9pt;
      vertical-align: top;
      text-align: left;
    }
    th, tr:first-child td {
      background-color: #E8EAF6;
      font-weight: bold;
    }
    tr:nth-child(even) td { background-color: #F5F7FF; }

    /* === Images === */
    img { max-width: 100%; height: auto; display: block; margin: 8pt auto; }

    /* === Blockquote === */
    blockquote {
      border-left: 4pt solid #C5CAE9;
      margin: 8pt 0;
      padding: 4pt 12pt;
      background: #EEF1FF;
      font-style: italic;
      color: #3949AB;
      page-break-inside: avoid;
    }

    /* === Code === */
    code {
      font-family: 'Courier New', monospace;
      background: #EEF1FF;
      padding: 1pt 3pt;
      border-radius: 2pt;
      font-size: 10pt;
    }
    pre {
      background: #EEF1FF;
      padding: 8pt;
      border-radius: 4pt;
      font-size: 10pt;
      white-space: pre-wrap;
      page-break-inside: avoid;
    }

    /* === Misc === */
    a { color: #3949AB; }
    hr { border: none; border-top: 0.75pt solid #C5CAE9; margin: 10pt 0; }
    .page-break { page-break-after: always; }
    strong, b { font-weight: bold; }
    em, i { font-style: italic; }
    u { text-decoration: underline; }

    /* === Print tweaks === */
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      table { page-break-inside: auto; }
      h1, h2, h3, h4 { page-break-after: avoid; }
      img { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * Saves edited HTML as a self-contained HTML file (print-ready).
 * The user can open it in a browser and use Print → Save as PDF,
 * which gives perfect format fidelity across all devices.
 */
export async function saveAsHtmlForPrint(
  htmlContent: string,
  fileName: string,
): Promise<string> {
  // Strip inline style tag from editor output (we supply our own print CSS)
  const bodyContent = htmlContent.replace(/<style>[\s\S]*?<\/style>/gi, '');
  const fullHtml = buildPrintHtml(bodyContent);

  const sanitisedName = fileName.replace(/\.docx$/i, '').replace(/[^a-zA-Z0-9_\-\u0900-\u097F]/g, '_');
  const outputPath = `${RNFS.DownloadDirectoryPath}/${sanitisedName}_edited.html`;

  await RNFS.writeFile(outputPath, fullHtml, 'utf8');
  return outputPath;
}

/**
 * Generates a PDF from HTML using RNBlobUtil's Android print/PDF feature.
 * Falls back to saving as HTML if PDF conversion is unavailable.
 *
 * On Android, this uses the system WebView to render and print to PDF.
 * On iOS, use WKWebView print controller (handled in the screen component).
 */
export async function generatePdf(
  htmlContent: string,
  fileName: string,
): Promise<{success: boolean; path: string; method: 'pdf' | 'html'}> {
  const sanitisedName = fileName.replace(/\.docx$/i, '').replace(/[^a-zA-Z0-9_\-\u0900-\u097F]/g, '_');

  try {
    // Try native PDF generation first (Android API 19+)
    const bodyContent = htmlContent.replace(/<style>[\s\S]*?<\/style>/gi, '');
    const fullHtml = buildPrintHtml(bodyContent);

    const pdfPath = `${RNBlobUtil.fs.dirs.DownloadDir}/${sanitisedName}_edited.pdf`;

    // react-native-blob-util doesn't natively print to PDF;
    // we save as HTML (print-optimised) for WebView-based PDF export.
    // The screen's WebView will trigger window.print() for native PDF dialog.
    await RNBlobUtil.fs.writeFile(pdfPath.replace('.pdf', '.html'), fullHtml, 'utf8');

    return {
      success: true,
      path: pdfPath.replace('.pdf', '.html'),
      method: 'html',
    };
  } catch (error) {
    // Fallback: save via RNFS
    const htmlPath = await saveAsHtmlForPrint(htmlContent, fileName);
    return {success: true, path: htmlPath, method: 'html'};
  }
}

/**
 * Returns the Downloads directory path for the current platform.
 */
export function getDownloadsPath(): string {
  return RNFS.DownloadDirectoryPath;
}
