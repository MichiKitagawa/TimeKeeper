import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Text as ReactNativeText } from 'react-native';
import AppNavigator, { AuthProvider } from '../AppNavigator';

// モック
jest.mock('@react-native-firebase/auth', () => {
  const mockAuthSingleton = { // シングルトンインスタンスのモック
    onAuthStateChanged: jest.fn(),
    // currentUser: null, // 必要に応じて
    // signInAnonymously: jest.fn(), // 等々
  };
  const mockAuthFactory = jest.fn(() => mockAuthSingleton); // auth() の呼び出しがこのファクトリを返す
  // @ts-ignore
  mockAuthFactory.FirebaseAuthTypes = { User: jest.fn() }; // FirebaseAuthTypes.User のモック
  return mockAuthFactory;
});

jest.mock('../../services/userService', () => ({
  isUserInactive: jest.fn(),
  getUserPaymentStatus: jest.fn(),
}));

// スクリーンコンポーネントのモック (修正)
jest.mock('../../screens/AuthLoadingScreen', () => () => {
  const { Text } = require('react-native');
  return <Text>mock-AuthLoadingScreen</Text>;
});
jest.mock('../../screens/LoginScreen', () => () => {
  const { Text } = require('react-native');
  return <Text>mock-LoginScreen</Text>;
});
jest.mock('../../screens/MainScreen', () => () => {
  const { Text } = require('react-native');
  return <Text>mock-MainScreen</Text>;
});
jest.mock('../../screens/DepositScreen', () => () => {
  const { Text } = require('react-native');
  return <Text>mock-DepositScreen</Text>;
});
jest.mock('../../screens/TimeSettingScreen', () => () => {
  const { Text } = require('react-native');
  return <Text>mock-TimeSettingScreen</Text>;
});
jest.mock('../../screens/LockScreen', () => () => {
  const { Text } = require('react-native');
  return <Text>mock-LockScreen</Text>;
});
jest.mock('../../screens/CompletionScreen', () => () => {
  const { Text } = require('react-native');
  return <Text>mock-CompletionScreen</Text>;
});

const mockUser = { uid: 'test-uid', email: 'test@example.com' } as any;

describe('AppNavigator', () => {
  // `auth()` によって返されるモックインスタンスを取得
  const authMockInstance = require('@react-native-firebase/auth')(); 
  const { isUserInactive, getUserPaymentStatus } = require('../../services/userService');

  beforeEach(() => {
    jest.clearAllMocks();
    
    // auth().onAuthStateChanged のモックをリセット・再設定
    // authMockInstance.onAuthStateChanged は jest.fn() で初期化されているので、
    // その振る舞いをテストケースごとに mockImplementation で変える
    // 例: authMockInstance.onAuthStateChanged.mockImplementation((callback) => { callback(mockUser); return jest.fn(); });

    isUserInactive.mockResolvedValue(false);
    getUserPaymentStatus.mockResolvedValue({ status: 'paid' });
  });

  const renderWithAuthProvider = (component: React.ReactElement) => {
    return render(<AuthProvider>{component}</AuthProvider>);
  };

  test('1. ローディング中 (auth isLoading): AuthLoadingScreen を表示', async () => {
    // onAuthStateChanged がまだコールバックを呼ばない状態 (AuthProviderのisLoading=true)
    authMockInstance.onAuthStateChanged.mockImplementation(() => jest.fn()); // コールバックを呼ばないようにする

    const { findByText } = renderWithAuthProvider(<AppNavigator />);
    expect(await findByText('mock-AuthLoadingScreen')).toBeTruthy();
  });

  test('2. ローディング中 (isCheckingUserStatus): AuthLoadingScreen を表示', async () => {
    authMockInstance.onAuthStateChanged.mockImplementation((callback: any) => {
      callback(mockUser); // ユーザーはいる
      return jest.fn(); // unsubscribe function
    });
    isUserInactive.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(false), 100))); // 遅延

    const { findByText } = renderWithAuthProvider(<AppNavigator />);
    expect(await findByText('mock-AuthLoadingScreen')).toBeTruthy(); // 初期表示 (isLoading or isCheckingUserStatus)
    
    await waitFor(() => expect(isUserInactive).toHaveBeenCalled());
  });

  test('3. 認証スタック: LoginScreen を表示', async () => {
    authMockInstance.onAuthStateChanged.mockImplementation((callback: any) => {
      callback(null); // ユーザーなし
      return jest.fn();
    });

    const { findByText } = renderWithAuthProvider(<AppNavigator />);
    await waitFor(() => expect(authMockInstance.onAuthStateChanged).toHaveBeenCalled());
    expect(await findByText('mock-LoginScreen')).toBeTruthy();
  });

  test('4. アプリスタック (メイン画面へ): MainScreen を表示', async () => {
    authMockInstance.onAuthStateChanged.mockImplementation((callback: any) => {
      callback(mockUser);
      return jest.fn();
    });
    isUserInactive.mockResolvedValue(false);
    getUserPaymentStatus.mockResolvedValue({ status: 'paid' });

    const { findByText } = renderWithAuthProvider(<AppNavigator />);
    await waitFor(() => expect(isUserInactive).toHaveBeenCalled());
    await waitFor(() => expect(getUserPaymentStatus).toHaveBeenCalled());
    expect(await findByText('mock-MainScreen')).toBeTruthy();
  });

  test('5. アプリスタック (支払い画面へ - 非アクティブ): DepositScreen を表示', async () => {
    authMockInstance.onAuthStateChanged.mockImplementation((callback: any) => {
      callback(mockUser);
      return jest.fn();
    });
    isUserInactive.mockResolvedValue(true);
    getUserPaymentStatus.mockResolvedValue({ status: 'paid' });

    const { findByText } = renderWithAuthProvider(<AppNavigator />);
    await waitFor(() => expect(isUserInactive).toHaveBeenCalled());
    await waitFor(() => expect(getUserPaymentStatus).toHaveBeenCalled()); 
    expect(await findByText('mock-DepositScreen')).toBeTruthy();
  });

  test('6. アプリスタック (支払い画面へ - 未払い): DepositScreen を表示', async () => {
    authMockInstance.onAuthStateChanged.mockImplementation((callback: any) => {
      callback(mockUser);
      return jest.fn();
    });
    isUserInactive.mockResolvedValue(false);
    getUserPaymentStatus.mockResolvedValue(null);

    const { findByText } = renderWithAuthProvider(<AppNavigator />);
    await waitFor(() => expect(isUserInactive).toHaveBeenCalled());
    await waitFor(() => expect(getUserPaymentStatus).toHaveBeenCalled());
    expect(await findByText('mock-DepositScreen')).toBeTruthy();
  });
  
  test('7. アプリスタック (支払い画面へ - 支払いステータスが "pending"): DepositScreen を表示', async () => {
    authMockInstance.onAuthStateChanged.mockImplementation((callback: any) => {
      callback(mockUser);
      return jest.fn();
    });
    isUserInactive.mockResolvedValue(false);
    getUserPaymentStatus.mockResolvedValue({ status: 'pending' });

    const { findByText } = renderWithAuthProvider(<AppNavigator />);
    await waitFor(() => expect(isUserInactive).toHaveBeenCalled());
    await waitFor(() => expect(getUserPaymentStatus).toHaveBeenCalled());
    expect(await findByText('mock-DepositScreen')).toBeTruthy();
  });

  test('8. userService.isUserInactive がエラー: MainScreen を表示', async () => {
    authMockInstance.onAuthStateChanged.mockImplementation((callback: any) => {
      callback(mockUser);
      return jest.fn();
    });
    isUserInactive.mockRejectedValue(new Error('Failed to check user activity'));
    getUserPaymentStatus.mockResolvedValue({ status: 'paid' });
    
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { findByText } = renderWithAuthProvider(<AppNavigator />);
    await waitFor(() => expect(isUserInactive).toHaveBeenCalled());
    expect(await findByText('mock-MainScreen')).toBeTruthy();
    
    consoleErrorSpy.mockRestore();
  });

  test('9. userService.getUserPaymentStatus がエラー: MainScreen を表示', async () => {
    authMockInstance.onAuthStateChanged.mockImplementation((callback: any) => {
      callback(mockUser);
      return jest.fn();
    });
    isUserInactive.mockResolvedValue(false);
    getUserPaymentStatus.mockRejectedValue(new Error('Failed to get payment status'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { findByText } = renderWithAuthProvider(<AppNavigator />);
    await waitFor(() => expect(isUserInactive).toHaveBeenCalled());
    await waitFor(() => expect(getUserPaymentStatus).toHaveBeenCalled());
    expect(await findByText('mock-MainScreen')).toBeTruthy();

    consoleErrorSpy.mockRestore();
  });
}); 