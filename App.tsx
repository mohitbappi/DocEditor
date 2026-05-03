/**
 * DocxEditorApp
 * A React Native app for editing .docx files with Hindi & English support
 * Flow: Upload DOCX → Convert to HTML → Edit → Download PDF
 */

import React from 'react';
import {SafeAreaView, StatusBar, StyleSheet} from 'react-native';
import DocxEditorScreen from './src/screens/DocxEditorScreen';
import {COLORS} from './src/utils/constants';

const App: React.FC = () => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.primary}
        translucent={false}
      />
      <DocxEditorScreen />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});

export default App;
