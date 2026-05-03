// src/components/LanguageToggle.tsx

import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {COLORS} from '../utils/constants';
import {Language} from '../types';

interface LanguageToggleProps {
  activeLanguage: Language;
  onToggle: (lang: Language) => void;
}

const LanguageToggle: React.FC<LanguageToggleProps> = ({
  activeLanguage,
  onToggle,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.option,
          activeLanguage === 'en' && styles.optionActive,
        ]}
        onPress={() => onToggle('en')}
        accessibilityRole="radio"
        accessibilityState={{checked: activeLanguage === 'en'}}>
        <Text
          style={[
            styles.optionText,
            activeLanguage === 'en' && styles.optionTextActive,
          ]}>
          EN
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.option,
          activeLanguage === 'hi' && styles.optionActiveHindi,
        ]}
        onPress={() => onToggle('hi')}
        accessibilityRole="radio"
        accessibilityState={{checked: activeLanguage === 'hi'}}>
        <Text
          style={[
            styles.optionText,
            activeLanguage === 'hi' && styles.optionTextActive,
          ]}>
          हि
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 2,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 18,
    minWidth: 38,
    alignItems: 'center',
  },
  optionActive: {
    backgroundColor: COLORS.english,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  optionActiveHindi: {
    backgroundColor: COLORS.hindi,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  optionTextActive: {
    color: '#fff',
  },
});

export default LanguageToggle;
