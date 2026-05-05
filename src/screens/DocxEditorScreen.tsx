// src/screens/DocxEditorScreen.tsx
/**
 * Main screen for the DOCX Editor POC.
 *
 * Flow:
 *  1. Admin picks a .docx file via @react-native-documents/picker
 *  2. Mammoth converts it to HTML preserving all formatting
 *  3. react-native-pell-rich-editor provides a full rich-text editor
 *     with Hindi + English keyboard support
 *  4. Admin taps Proceed → selects page size (A4 / Legal) → downloads PDF
 *
 * Changes from previous version:
 *  - Page size selector added to the download step (A4 / Legal).
 *  - generatePdf() now receives the chosen PageSize.
 *  - <style> blocks are NO LONGER stripped before export — this was the
 *    primary cause of formatting loss in the PDF.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import {
  RichEditor,
  RichToolbar,
  actions,
} from 'react-native-pell-rich-editor';

import {
  pick,
  keepLocalCopy,
  isErrorWithCode,
  errorCodes,
  types,
} from '@react-native-documents/picker';
import type { DocumentPickerResponse } from '@react-native-documents/picker';
import { COLORS, STRINGS, MAX_FILE_SIZE_MB } from '../utils/constants';
import { convertDocxToHtml, validateDocxFile } from '../utils/docxConverter';
import { generatePdf, PAGE_SIZES } from '../utils/pdfGenerator';
import type { PageSize } from '../utils/pdfGenerator';
import { EditorState, Language } from '../types';
import UploadSection from '../components/UploadSection';
import StepIndicator from '../components/StepIndicator';
import LanguageToggle from '../components/LanguageToggle';
import ExportSection from '../components/ExportSection';

const DocxEditorScreen: React.FC = () => {
  const richEditorRef = useRef<RichEditor>(null);

  const [state, setState] = useState<EditorState>({
    step: 'upload',
    fileName: null,
    filePath: null,
    htmlContent: '',
    isLoading: false,
    loadingMessage: '',
    error: null,
    activeLanguage: 'en',
  });

  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [editorHtml, setEditorHtml] = useState<string>('');

  // ── Page size state — default A4, user can change in the download step ──
  const [selectedPageSize, setSelectedPageSize] = useState<PageSize>('A4');

  const strings = STRINGS[state.activeLanguage];

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const setLoading = (msg: string) =>
    setState(prev => ({
      ...prev,
      isLoading: true,
      loadingMessage: msg,
      error: null,
    }));

  const setError = (error: string) =>
    setState(prev => ({ ...prev, isLoading: false, error }));

  const clearError = () => setState(prev => ({ ...prev, error: null }));

  // ─── Step 1: Pick DOCX File ────────────────────────────────────────────────

  const handlePickFile = useCallback(async () => {
    clearError();
    try {
      const results: DocumentPickerResponse[] = await pick({
        allowMultiSelection: false,
        type: [types.allFiles],
      });

      const file = results[0];

      const name = file.name ?? '';
      if (!name.toLowerCase().endsWith('.docx')) {
        setError(strings.fileTypeError);
        return;
      }

      const sizeMB = (file.size ?? 0) / (1024 * 1024);
      if (sizeMB > MAX_FILE_SIZE_MB) {
        setError(strings.fileSizeError);
        return;
      }

      setLoading(strings.convertingMsg);

      const copyResults = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: name }],
        destination: 'cachesDirectory',
      });

      const copyResult = copyResults[0];
      if (copyResult.status === 'error') {
        setError(copyResult.copyError ?? strings.errorMsg);
        return;
      }

      const cleanPath = decodeURIComponent(
        copyResult.localUri.replace('file://', ''),
      );

      const isValid = await validateDocxFile(cleanPath);
      if (!isValid) {
        setError(strings.fileTypeError);
        return;
      }

      const conversion = await convertDocxToHtml(cleanPath);

      if (conversion.messages.length > 0) {
        console.warn('Conversion messages:', conversion.messages);
      }

      setState(prev => ({
        ...prev,
        step: 'edit',
        fileName: name,
        filePath: cleanPath,
        htmlContent: conversion.html,
        isLoading: false,
        loadingMessage: '',
        error: null,
      }));

      setEditorHtml(conversion.html);

      setTimeout(() => {
        richEditorRef.current?.setContentHTML(conversion.html);
      }, 300);
    } catch (err: unknown) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      setError(err instanceof Error ? err.message : strings.errorMsg);
    }
  }, [strings]);

  // ─── Step 2: Editor events ─────────────────────────────────────────────────

  const handleEditorChange = useCallback((html: string) => {
    setEditorHtml(html);
  }, []);

  const handleProceedToDownload = useCallback(async () => {
    const currentHtml = await richEditorRef.current?.getContentHtml();
    if (currentHtml !== undefined) {
      setEditorHtml(currentHtml);
    }
    setState(prev => ({ ...prev, step: 'download', error: null }));
  }, []);

  const handleEditAgain = useCallback(() => {
    setSavedPath(null);
    setState(prev => ({ ...prev, step: 'edit', error: null }));
    setTimeout(() => {
      richEditorRef.current?.setContentHTML(editorHtml);
    }, 300);
  }, [editorHtml]);

  // ─── Step 3: Export ────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setLoading(strings.downloadingMsg);
    try {
      const result = await generatePdf(
        editorHtml,
        state.fileName ?? 'document',
        selectedPageSize, // ← pass chosen page size
      );
      if (result.success) {
        setSavedPath(result.path);
        setState(prev => ({ ...prev, isLoading: false }));
        Alert.alert(
          strings.successMsg,
          result.method === 'html'
            ? state.activeLanguage === 'hi'
              ? 'Downloads फ़ोल्डर में HTML फ़ाइल खोलें और PDF के लिए Print करें।'
              : 'Open the HTML file in your Downloads folder and Print to save as PDF.'
            : result.path,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.errorMsg);
    }
  }, [
    editorHtml,
    state.fileName,
    state.activeLanguage,
    strings,
    selectedPageSize,
  ]);

  // ─── Language toggle ───────────────────────────────────────────────────────

  const handleLanguageToggle = useCallback((lang: Language) => {
    setState(prev => ({ ...prev, activeLanguage: lang }));
    if (lang === 'hi') {
      richEditorRef.current?.focusContentEditor();
    }
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  const isEditorStep = state.step === 'edit';

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{strings.appTitle}</Text>
          {state.fileName ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {state.fileName}
            </Text>
          ) : null}
        </View>
        <LanguageToggle
          activeLanguage={state.activeLanguage}
          onToggle={handleLanguageToggle}
        />
      </View>

      {/* ── Step Indicator ── */}
      <StepIndicator currentStep={state.step} language={state.activeLanguage} />

      {/* ── Content ── */}
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* STEP 1: Upload */}
        {state.step === 'upload' && (
          <UploadSection
            onPickFile={handlePickFile}
            isLoading={state.isLoading}
            loadingMessage={state.loadingMessage}
            language={state.activeLanguage}
            error={state.error}
          />
        )}

        {/* STEP 2: Edit */}
        {isEditorStep && (
          <View style={styles.editorContainer}>
            {/* Rich Text Toolbar */}
            <RichToolbar
              editor={richEditorRef}
              style={styles.toolbar}
              iconTint={COLORS.surface}
              selectedIconTint={COLORS.accentLight}
              disabledIconTint={COLORS.disabled}
              iconSize={22}
              actions={[
                actions.undo,
                actions.redo,
                actions.setBold,
                actions.setItalic,
                actions.setUnderline,
                actions.setStrikethrough,
                actions.heading1,
                actions.heading2,
                actions.heading3,
                actions.insertBulletsList,
                actions.insertOrderedList,
                actions.alignLeft,
                actions.alignCenter,
                actions.alignRight,
                actions.alignFull,
                actions.indent,
                actions.outdent,
                actions.blockquote,
                actions.removeFormat,
              ]}
              iconMap={{
                [actions.heading1]: () => (
                  <Text style={styles.toolbarTextIcon}>H1</Text>
                ),
                [actions.heading2]: () => (
                  <Text style={styles.toolbarTextIcon}>H2</Text>
                ),
                [actions.heading3]: () => (
                  <Text style={styles.toolbarTextIcon}>H3</Text>
                ),
                [actions.blockquote]: () => (
                  <Text style={styles.toolbarTextIcon}>"</Text>
                ),
                [actions.indent]: () => (
                  <Text style={styles.toolbarTextIcon}>→</Text>
                ),
                [actions.outdent]: () => (
                  <Text style={styles.toolbarTextIcon}>←</Text>
                ),
              }}
            />

            {/* Language & keyboard hint bar */}
            <View style={styles.langHintBar}>
              <Text style={styles.langHintText}>
                {state.activeLanguage === 'hi'
                  ? '🇮🇳 हिंदी/Devanagari keyboard सक्रिय — कीबोर्ड में भाषा बदलें'
                  : '🇬🇧 English mode — switch keyboard language for Hindi input'}
              </Text>
              {state.fileName ? (
                <TouchableOpacity
                  onPress={() =>
                    setState(prev => ({ ...prev, step: 'upload', error: null }))
                  }
                  style={styles.changeFileBtn}
                >
                  <Text style={styles.changeFileBtnText}>
                    {strings.changeFile}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Rich Editor */}
            <ScrollView style={styles.editorScroll} nestedScrollEnabled>
              <RichEditor
                ref={richEditorRef}
                style={styles.richEditor}
                initialContentHTML={state.htmlContent}
                onChange={handleEditorChange}
                placeholder={strings.editPlaceholder}
                useContainer={true}
                autoCapitalize="sentences"
                autoCorrect
                initialHeight={500}
                editorStyle={{
                  backgroundColor: COLORS.surface,
                  color: COLORS.text,
                  placeholderColor: COLORS.textLight,
                  cssText: `
                    body {
                      font-family: 'Noto Sans', 'Noto Sans Devanagari', Georgia, serif;
                      font-size: 16px;
                      line-height: 1.7;
                      padding: 12px 16px;
                    }
                    [lang="hi"], .hindi-text {
                      font-family: 'Noto Sans Devanagari', sans-serif;
                    }
                    h1 { font-size: 24px; border-bottom: 2px solid #C5CAE9; padding-bottom: 6px; color: #0D1347; }
                    h2 { font-size: 20px; color: #1A237E; }
                    h3 { font-size: 17px; }
                    table { border-collapse: collapse; width: 100%; }
                    td, th { border: 1px solid #C5CAE9; padding: 6px 10px; }
                    th { background: #E8EAF6; font-weight: bold; }
                    blockquote { border-left: 4px solid #C5CAE9; padding: 4px 12px; background: #EEF1FF; }
                    img { max-width: 100%; height: auto; }
                  `,
                  caretColor: COLORS.primary,
                }}
              />
            </ScrollView>

            {/* Bottom action bar */}
            <View style={styles.actionBar}>
              <View style={styles.actionBarInfo}>
                <Text style={styles.actionBarText}>
                  {state.activeLanguage === 'hi'
                    ? 'संपादन पूर्ण होने पर आगे बढ़ें'
                    : 'Proceed when editing is complete'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.proceedButton}
                onPress={handleProceedToDownload}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.proceedButtonText}>
                  {state.activeLanguage === 'hi' ? 'आगे बढ़ें →' : 'Proceed →'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 3: Export/Download */}
        {state.step === 'download' && (
          <ScrollView
            style={styles.downloadScroll}
            contentContainerStyle={styles.downloadScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Page Size Selector ─────────────────────────────────────── */}
            <View style={styles.pageSizeCard}>
              <Text style={styles.pageSizeTitle}>
                {state.activeLanguage === 'hi'
                  ? '📄 पेज का आकार चुनें'
                  : '📄 Select Page Size'}
              </Text>
              <Text style={styles.pageSizeSubtitle}>
                {state.activeLanguage === 'hi'
                  ? 'PDF किस आकार में सहेजें?'
                  : 'Choose the paper size for the exported PDF'}
              </Text>

              <View style={styles.pageSizeOptions}>
                {(Object.keys(PAGE_SIZES) as PageSize[]).map(size => {
                  const isSelected = selectedPageSize === size;
                  return (
                    <TouchableOpacity
                      key={size}
                      style={[
                        styles.pageSizeOption,
                        isSelected && styles.pageSizeOptionSelected,
                      ]}
                      onPress={() => setSelectedPageSize(size)}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      {/* Radio dot */}
                      <View style={styles.radioOuter}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>

                      <View style={styles.pageSizeOptionText}>
                        <Text
                          style={[
                            styles.pageSizeOptionName,
                            isSelected && styles.pageSizeOptionNameSelected,
                          ]}
                        >
                          {size}
                        </Text>
                        <Text style={styles.pageSizeOptionDimension}>
                          {PAGE_SIZES[size].label}
                        </Text>
                      </View>

                      {/* Miniature page icon */}
                      <View
                        style={[
                          styles.pageMiniature,
                          size === 'Legal' && styles.pageMiniatureLegal,
                          isSelected && styles.pageMiniatureSelected,
                        ]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── ExportSection (existing component) ────────────────────── */}
            <ExportSection
              fileName={state.fileName ?? 'document.docx'}
              htmlContent={editorHtml}
              isLoading={state.isLoading}
              loadingMessage={state.loadingMessage}
              language={state.activeLanguage}
              savedPath={savedPath}
              error={state.error}
              onExport={handleExport}
              onEditAgain={handleEditAgain}
            />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },

  // ── Editor step ────────────────────────────────────────────────────────
  editorContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  toolbar: {
    backgroundColor: COLORS.toolbarBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryDark,
    height: 48,
  },
  toolbarTextIcon: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: 'bold',
  },
  langHintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  langHintText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  changeFileBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  changeFileBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  editorScroll: {
    flex: 1,
  },
  richEditor: {
    flex: 1,
    minHeight: 400,
    backgroundColor: COLORS.surface,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  actionBarInfo: {
    flex: 1,
    marginRight: 12,
  },
  actionBarText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  proceedButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 3,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  proceedButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },

  // ── Download step ──────────────────────────────────────────────────────
  downloadScroll: {
    flex: 1,
  },
  downloadScrollContent: {
    paddingBottom: 32,
  },

  // ── Page size card ─────────────────────────────────────────────────────
  pageSizeCard: {
    margin: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  pageSizeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  pageSizeSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 16,
    lineHeight: 17,
  },
  pageSizeOptions: {
    gap: 10,
  },
  pageSizeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  pageSizeOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#EEF1FF',
  },

  // Radio button
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },

  pageSizeOptionText: {
    flex: 1,
  },
  pageSizeOptionName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  pageSizeOptionNameSelected: {
    color: COLORS.primary,
  },
  pageSizeOptionDimension: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Miniature page shape icon
  pageMiniature: {
    width: 22,
    height: 28, // A4 aspect ~1:√2
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    backgroundColor: '#fff',
    marginLeft: 12,
  },
  pageMiniatureLegal: {
    height: 36, // Legal is taller
  },
  pageMiniatureSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#C5CAE9',
  },
});

export default DocxEditorScreen;
