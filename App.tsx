/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useRef } from 'react';
import { StatusBar, useColorScheme, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import AppNavigator, { AuthProvider } from './src/navigation/AppNavigator';
import { initializeUsageTracking } from './src/services/usageTrackingService';
import { updateLastActiveDate } from './src/services/userService';

function App(): React.JSX.Element {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App has come to the foreground!');
        try {
          await updateLastActiveDate();
        } catch (error) {
          console.error('Failed to update last active date on app foreground:', error);
        }
      }
      appState.current = nextAppState;
    });

    // 初期起動時にも一度呼び出す（任意、ただしユーザーが既にログインしている場合のみ有効）
    // アプリ起動時にフォアグラウンドになるため、上記のリスナーでもカバーされるが、
    // より確実に記録するため、また初回起動フローなどを考慮してここでも呼ぶことを検討
    updateLastActiveDate().catch(error => {
      console.error('Failed to update last active date on initial app load:', error);
    });

    const cleanupUsageTracking = initializeUsageTracking();
    return () => {
      cleanupUsageTracking();
      subscription.remove();
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
