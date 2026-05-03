// src/components/ExportSection.tsx

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {COLORS, STRINGS} from '../utils/constants';
import {Language} from '../types';

interface ExportSectionProps {
  fileName: string;
  htmlContent: string;
  isLoading: boolean;
  loadingMessage: string;
  language: Language;
  savedPath: string | null;
  error: string | null;
  onExport: () => void;
  onEditAgain: () => void;
}

const ExportSection: React.FC<ExportSectionProps> = ({
  fileName,
  isLoading,
  loadingMessage,
  language,
  savedPath,
  error,
  onExport,
  onEditAgain,
}) => {
  const strings = STRINGS[language];

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      {/* Success state */}
      {savedPath ? (
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Text style={styles.successEmoji}>✅</Text>
          </View>
          <Text style={styles.successTitle}>{strings.successMsg}</Text>
          <View style={styles.pathBox}>
            <Text style={styles.pathLabel}>
              {language === 'hi' ? 'सहेजा गया:' : 'Saved to:'}
            </Text>
            <Text style={styles.pathText} numberOfLines={3}>
              {savedPath}
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>
              {language === 'hi' ? '📋 PDF के रूप में कैसे खोलें:' : '📋 How to open as PDF:'}
            </Text>
            <Text style={styles.infoStep}>
              {language === 'hi'
                ? '1. Downloads फ़ोल्डर में HTML फ़ाइल खोलें'
                : '1. Open the HTML file in your Downloads folder'}
            </Text>
            <Text style={styles.infoStep}>
              {language === 'hi'
                ? '2. ब्राउज़र मेनू → Share → Print'
                : '2. Browser menu → Share → Print'}
            </Text>
            <Text style={styles.infoStep}>
              {language === 'hi'
                ? '3. Printer: "PDF के रूप में सहेजें" चुनें'
                : '3. Printer: Choose "Save as PDF"'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onEditAgain}
            activeOpacity={0.8}>
            <Text style={styles.secondaryButtonText}>
              {language === 'hi' ? '✏️ फिर से संपादित करें' : '✏️ Edit Again'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.exportContainer}>
          {/* Document preview card */}
          <View style={styles.previewCard}>
            <View style={styles.previewIcon}>
              <Text style={styles.previewEmoji}>📄</Text>
            </View>
            <View style={styles.previewInfo}>
              <Text style={styles.previewName} numberOfLines={2}>
                {fileName}
              </Text>
              <Text style={styles.previewReady}>
                {language === 'hi'
                  ? 'निर्यात के लिए तैयार'
                  : 'Ready to export'}
              </Text>
            </View>
          </View>

          {/* Export options */}
          <Text style={styles.sectionTitle}>
            {language === 'hi' ? 'निर्यात विकल्प' : 'Export Options'}
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.loadingText}>{loadingMessage}</Text>
            </View>
          ) : (
            <>
              {/* Primary: HTML for PDF */}
              <TouchableOpacity
                style={styles.exportButton}
                onPress={onExport}
                activeOpacity={0.8}
                accessibilityRole="button">
                <Text style={styles.exportButtonIcon}>📥</Text>
                <View style={styles.exportButtonContent}>
                  <Text style={styles.exportButtonTitle}>
                    {strings.downloadBtn}
                  </Text>
                  <Text style={styles.exportButtonSub}>
                    {language === 'hi'
                      ? 'HTML फ़ाइल → ब्राउज़र में PDF'
                      : 'HTML file → Open in browser → Print to PDF'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backButton}
                onPress={onEditAgain}
                activeOpacity={0.8}>
                <Text style={styles.backButtonText}>
                  {language === 'hi' ? '← वापस संपादित करें' : '← Back to Edit'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Features list */}
          <View style={styles.featuresList}>
            {(language === 'hi'
              ? ['✓ हिंदी फ़ॉन्ट संरक्षित', '✓ तालिकाएं सुरक्षित', '✓ शीर्षक क्रम बनाए रखा', '✓ छवियां शामिल']
              : ['✓ Hindi fonts preserved', '✓ Tables maintained', '✓ Heading hierarchy kept', '✓ Images embedded']
            ).map(feature => (
              <Text key={feature} style={styles.featureItem}>
                {feature}
              </Text>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
  },
  exportContainer: {
    flex: 1,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
  },
  successIcon: {
    marginBottom: 16,
  },
  successEmoji: {
    fontSize: 64,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.success,
    marginBottom: 16,
    textAlign: 'center',
  },
  pathBox: {
    backgroundColor: COLORS.successLight,
    borderRadius: 10,
    padding: 14,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  pathLabel: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pathText: {
    fontSize: 13,
    color: COLORS.text,
    fontFamily: 'monospace',
  },
  infoCard: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  infoStep: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  previewIcon: {
    marginRight: 14,
  },
  previewEmoji: {
    fontSize: 36,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  previewReady: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  errorBox: {
    backgroundColor: COLORS.errorLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: COLORS.accent,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  exportButtonIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  exportButtonContent: {
    flex: 1,
  },
  exportButtonTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  exportButtonSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
  },
  secondaryButton: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  backButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  backButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  featuresList: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  featureItem: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 5,
    lineHeight: 20,
  },
});

export default ExportSection;
