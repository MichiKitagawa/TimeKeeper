/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import AppNavigator, { AuthProvider } from './src/navigation/AppNavigator';
import { initializeUsageTracking } from './src/services/usageTrackingService';

function App(): React.JSX.Element {
  useEffect(() => {
    const cleanupUsageTracking = initializeUsageTracking();
    return () => {
      cleanupUsageTracking();
    };
  }, []);

  const isDarkMode = useColorScheme() === 'dark';

  return (
    <AuthProvider>
      <SafeAreaProvider>
        <PaperProvider>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          <AppNavigator />
        </PaperProvider>
      </SafeAreaProvider>
    </AuthProvider>
  );
}

export default App;
