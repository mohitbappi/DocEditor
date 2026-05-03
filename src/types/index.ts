// src/types/index.ts

export type EditorStep = 'upload' | 'edit' | 'download';

export type Language = 'en' | 'hi';

export interface DocxConversionResult {
  html: string;
  messages: ConversionMessage[];
}

export interface ConversionMessage {
  type: 'warning' | 'error' | 'info';
  message: string;
}

export interface EditorState {
  step: EditorStep;
  fileName: string | null;
  filePath: string | null;
  htmlContent: string;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  activeLanguage: Language;
}

export interface ToolbarAction {
  icon: string;
  label: string;
  action: string;
}

export interface PDFGenerationOptions {
  fileName: string;
  htmlContent: string;
}
