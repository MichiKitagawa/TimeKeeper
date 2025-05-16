import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

import AuthLoadingScreen from '../screens/AuthLoadingScreen';
import LoginScreen from '../screens/LoginScreen';
import MainScreen from '../screens/MainScreen';
import DepositScreen from '../screens/DepositScreen';
import TimeSettingScreen from '../screens/TimeSettingScreen';

// ナビゲーションパラメータリスト
export type AppStackParamList = {
  Home: undefined;
  Deposit: undefined;
  TimeSettingScreen: undefined;
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

const AppStackScreens = () => (
  <Stack.Navigator>
    <Stack.Screen name="Home" component={MainScreen} options={{ title: 'メイン' }} />
    <Stack.Screen name="Deposit" component={DepositScreen} options={{ title: '頭金入力' }} />
    <Stack.Screen name="TimeSettingScreen" component={TimeSettingScreen} options={{ title: '時間設定' }}/>
    {/* Add other app screens here */}
  </Stack.Navigator>
);

const AppNavigator = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  return (
    <NavigationContainer>
      {user ? <AppStackScreens /> : <AuthStackScreens />}
    </NavigationContainer>
  );
};

export default AppNavigator; 