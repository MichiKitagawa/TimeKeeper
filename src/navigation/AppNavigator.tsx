import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { ensureUserDocument, getUserFlowStatus } from '../services/userService';

import AuthLoadingScreen from '../screens/AuthLoadingScreen';
import LoginScreen from '../screens/LoginScreen';
import MainScreen from '../screens/MainScreen';
import DepositScreen from '../screens/DepositScreen';
import TimeSettingScreen from '../screens/TimeSettingScreen';
import LockScreen from '../screens/LockScreen';
import UnlockProcessingScreen from '../screens/UnlockProcessingScreen';

// ナビゲーションパラメータリスト
export type AppStackParamList = {
  Home: undefined;
  Deposit: undefined;
  TimeSettingScreen: undefined;
  LockScreen: undefined;
  UnlockProcessingScreen: { packageName: string, limitMinutes: number };
  // 他のApp内スクリーンもここに追加
};

export type AuthStackParamList = {
  Login: undefined;
};

type AuthContextType = {
  user: FirebaseAuthTypes.User | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const subscriber = auth().onAuthStateChanged(firebaseUser => {
      setUser(firebaseUser);
      setIsLoading(false);
    });
    return subscriber; // unsubscribe on unmount
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const Stack = createStackNavigator<AppStackParamList>();
const AuthStackNav = createStackNavigator<AuthStackParamList>();

const AuthStackScreens = () => (
  <AuthStackNav.Navigator screenOptions={{ headerShown: false }}>
    <AuthStackNav.Screen name="Login" component={LoginScreen} />
  </AuthStackNav.Navigator>
);

const AppStackScreens = ({ initialRoute = 'Home' }: { initialRoute?: keyof AppStackParamList }) => (
  <Stack.Navigator initialRouteName={initialRoute}>
    <Stack.Screen name="Home" component={MainScreen} options={{ title: 'メイン' }} />
    <Stack.Screen name="Deposit" component={DepositScreen} options={{ title: '利用料支払い' }} />
    <Stack.Screen name="TimeSettingScreen" component={TimeSettingScreen} options={{ title: '時間設定' }}/>
    <Stack.Screen name="LockScreen" component={LockScreen} options={{ title: 'ロック中', headerShown: false }} />
    <Stack.Screen name="UnlockProcessingScreen" component={UnlockProcessingScreen} options={{ title: 'アンロック処理' }} />
    {/* Add other app screens here */}
  </Stack.Navigator>
);

const AppNavigator = () => {
  const { user, isLoading } = useAuth();
  const [isCheckingUserStatus, setIsCheckingUserStatus] = useState(true);
  const [initialRouteName, setInitialRouteName] = useState<keyof AppStackParamList>('Home');
  const [appError, setAppError] = useState<string | null>(null);

  useEffect(() => {
    const checkUserStatusAndSetup = async () => {
      console.log('[AppNavigator] useEffect triggered. User:', user, 'isLoading:', isLoading);

      if (user && !isLoading) {
        console.log('[AppNavigator] User authenticated. Starting status check.');
        setIsCheckingUserStatus(true);
        setAppError(null);
        try {
          console.log('[AppNavigator] Calling ensureUserDocument...');
          await ensureUserDocument(user.uid);
          console.log('[AppNavigator] ensureUserDocument completed.');

          console.log('[AppNavigator] Calling getUserFlowStatus...');
          const userStatus = await getUserFlowStatus(user.uid);
          console.log('[AppNavigator] getUserFlowStatus completed. Result:', userStatus);
          const { timeLimitSet, paymentCompleted } = userStatus;

          if (!timeLimitSet) {
            console.log('[AppNavigator] Navigating to TimeSettingScreen.');
            setInitialRouteName('TimeSettingScreen');
          } else if (!paymentCompleted) {
            console.log('[AppNavigator] Navigating to Deposit.');
            setInitialRouteName('Deposit');
          } else {
            console.log('[AppNavigator] Navigating to Home.');
            setInitialRouteName('Home');
          }

        } catch (error: any) {
          console.error("[AppNavigator] Error during user status check or setup:", error);
          setAppError(`データ取得エラー: ${error.message || '不明なエラー'}`);
          setInitialRouteName('Home');
        } finally {
          console.log('[AppNavigator] Setting isCheckingUserStatus to false.');
          setIsCheckingUserStatus(false);
        }
      } else if (!isLoading) {
        console.log('[AppNavigator] User not authenticated or loading finished. Setting isCheckingUserStatus to false.');
        setIsCheckingUserStatus(false);
        setAppError(null);
      } else {
        console.log('[AppNavigator] Still loading user auth state.');
      }
    };

    checkUserStatusAndSetup();
  }, [user, isLoading]);

  if (isLoading || isCheckingUserStatus) {
    console.log('[AppNavigator] Showing AuthLoadingScreen. isLoading:', isLoading, 'isCheckingUserStatus:', isCheckingUserStatus);
    return <AuthLoadingScreen />;
  }

  console.log('[AppNavigator] Rendering main navigation. Initial route:', initialRouteName);
  return (
    <NavigationContainer>
      {user ? (
        <AppStackScreens initialRoute={initialRouteName} />
      ) : (
        <AuthStackScreens />
      )}
    </NavigationContainer>
  );
};

export default AppNavigator; 