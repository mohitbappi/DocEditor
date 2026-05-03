// src/components/UploadSection.tsx

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import {COLORS, STRINGS} from '../utils/constants';
import {Language} from '../types';

interface UploadSectionProps {
  onPickFile: () => void;
  isLoading: boolean;
  loadingMessage: string;
  language: Language;
  error: string | null;
}

const UploadSection: React.FC<UploadSectionProps> = ({
  onPickFile,
  isLoading,
  loadingMessage,
  language,
  error,
}) => {
  const strings = STRINGS[language];

  return (
    <View style={styles.container}>
      {/* Illustration */}
      <View style={styles.illustrationContainer}>
        <View style={styles.docIcon}>
          <View style={styles.docPage}>
            <View style={styles.docLine} />
            <View style={[styles.docLine, styles.docLineShort]} />
            <View style={styles.docLine} />
            <View style={[styles.docLine, styles.docLineShort]} />
            <View style={styles.docLine} />
          </View>
          <View style={styles.docBadge}>
            <Text style={styles.docBadgeText}>W</Text>
          </View>
        </View>

        {/* Upload arrow */}
        <View style={styles.arrowContainer}>
          <View style={styles.arrowShaft} />
          <View style={styles.arrowHead} />
        </View>
      </View>

      <Text style={styles.title}>{strings.uploadTitle}</Text>
      <Text style={styles.subtitle}>{strings.uploadSubtitle}</Text>

      {/* Format badges */}
      <View style={styles.badgeRow}>
        {['.docx', 'Hindi ✓', 'English ✓'].map(badge => (
          <View key={badge} style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ))}
      </View>

      {/* Error message */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Upload button */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{loadingMessage}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={onPickFile}
          activeOpacity={0.8}
          accessibilityLabel={strings.uploadBtn}
          accessibilityRole="button">
          <Text style={styles.uploadIcon}>📂</Text>
          <Text style={styles.uploadButtonText}>{strings.uploadBtn}</Text>
        </TouchableOpacity>
      )}

      {/* Info note */}
      <View style={styles.infoRow}>
        <Text style={styles.infoText}>
          {language === 'hi'
            ? 'अधिकतम फ़ाइल आकार: 10 MB'
            : 'Max file size: 10 MB • Format preserved on export'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  illustrationContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  docIcon: {
    position: 'relative',
    marginBottom: 16,
  },
  docPage: {
    width: 80,
    height: 100,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    padding: 12,
    justifyContent: 'space-evenly',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  docLine: {
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
  },
  docLineShort: {
    width: '65%',
  },
  docBadge: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  docBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  arrowContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  arrowShaft: {
    width: 3,
    height: 24,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.accent,
    marginTop: -2,
    transform: [{rotate: '180deg'}],
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badgeText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.errorLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.error,
    width: '100%',
  },
  errorIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.error,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 14,
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    gap: 10,
  },
  uploadIcon: {
    fontSize: 22,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  infoRow: {
    marginTop: 20,
  },
  infoText: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default UploadSection;
