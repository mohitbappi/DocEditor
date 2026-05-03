// src/components/StepIndicator.tsx

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {COLORS, STRINGS} from '../utils/constants';
import {EditorStep, Language} from '../types';

interface StepIndicatorProps {
  currentStep: EditorStep;
  language: Language;
}

const STEPS: EditorStep[] = ['upload', 'edit', 'download'];

const StepIndicator: React.FC<StepIndicatorProps> = ({currentStep, language}) => {
  const strings = STRINGS[language];
  const stepLabels = [strings.step1, strings.step2, strings.step3];
  const currentIndex = STEPS.indexOf(currentStep);

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;

        return (
          <React.Fragment key={step}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.circle,
                  isCompleted && styles.circleCompleted,
                  isActive && styles.circleActive,
                ]}>
                {isCompleted ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : (
                  <Text
                    style={[
                      styles.circleText,
                      isActive && styles.circleTextActive,
                    ]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  isActive && styles.labelActive,
                  isCompleted && styles.labelCompleted,
                ]}>
                {stepLabels[index]}
              </Text>
            </View>

            {/* Connector line */}
            {index < STEPS.length - 1 && (
              <View
                style={[
                  styles.connector,
                  index < currentIndex && styles.connectorCompleted,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  stepItem: {
    alignItems: 'center',
    gap: 4,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  circleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  circleCompleted: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  circleText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textLight,
  },
  circleTextActive: {
    color: '#fff',
  },
  checkmark: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold',
  },
  label: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  labelActive: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  labelCompleted: {
    color: COLORS.success,
  },
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.borderLight,
    marginBottom: 14,
    marginHorizontal: 4,
  },
  connectorCompleted: {
    backgroundColor: COLORS.success,
  },
});

export default StepIndicator;
