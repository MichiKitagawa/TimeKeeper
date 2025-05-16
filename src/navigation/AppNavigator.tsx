import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { isUserInactive, getUserPaymentStatus } from '../services/userService';

import AuthLoadingScreen from '../screens/AuthLoadingScreen';
import LoginScreen from '../screens/LoginScreen';
import MainScreen from '../screens/MainScreen';
import DepositScreen from '../screens/DepositScreen';
import TimeSettingScreen from '../screens/TimeSettingScreen';
import LockScreen from '../screens/LockScreen';
import CompletionScreen from '../screens/CompletionScreen';

// ナビゲーションパラメータリスト
export type AppStackParamList = {
  Home: undefined;
  Deposit: undefined;
  TimeSettingScreen: undefined;
  LockScreen: undefined;
  CompletionScreen: { challengeId: string };
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
    <Stack.Screen name="CompletionScreen" component={CompletionScreen} options={{ title: 'チャレンジ完了', headerShown: false }} />
    {/* Add other app screens here */}
  </Stack.Navigator>
);

const AppNavigator = () => {
  const { user, isLoading } = useAuth();
  const [isCheckingUserStatus, setIsCheckingUserStatus] = useState(true);
  const [requiresPayment, setRequiresPayment] = useState(false);
  const [initialRouteName, setInitialRouteName] = useState<keyof AppStackParamList>('Home');

  useEffect(() => {
    const checkUserStatus = async () => {
      if (user && !isLoading) {
        try {
          const inactive = await isUserInactive();
          const paymentInfo = await getUserPaymentStatus();

          const needsInitialPayment = !paymentInfo || paymentInfo.status !== 'paid';

          if (inactive || needsInitialPayment) {
            setRequiresPayment(true);
            setInitialRouteName('Deposit');
          } else {
            setRequiresPayment(false);
            setInitialRouteName('Home');
          }
        } catch (error) {
          console.error("Error checking user status:", error);
          // エラー時は安全のため支払い画面に誘導することも検討できるが、
          // ここではメイン画面に進ませる（ただし、isUserInactiveやgetUserPaymentStatus内でエラーが起きた場合の挙動による）
          setRequiresPayment(false); 
          setInitialRouteName('Home');
        }
        setIsCheckingUserStatus(false);
      } else if (!isLoading) {
        setIsCheckingUserStatus(false);
        setRequiresPayment(false);
        setInitialRouteName('Home');
      }
    };

    checkUserStatus();
  }, [user, isLoading]);

  if (isLoading || isCheckingUserStatus) {
    return <AuthLoadingScreen />;
  }

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