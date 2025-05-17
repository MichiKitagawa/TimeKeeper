import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import AppNavigator, { AuthProvider, useAuth } from '../AppNavigator';
import * as userService from '../../services/userService';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

// --- Mocks ---
// 画面コンポーネントの簡易モック
jest.mock('../../screens/AuthLoadingScreen', () => () => 'AuthLoadingScreen');
jest.mock('../../screens/LoginScreen', () => () => 'LoginScreen');
jest.mock('../../screens/MainScreen', () => () => 'MainScreen');
jest.mock('../../screens/DepositScreen', () => () => 'DepositScreen');
// 他の画面も必要に応じてモック

const mockIsUserInactive = jest.spyOn(userService, 'isUserInactive');
const mockGetUserPaymentStatus = jest.spyOn(userService, 'getUserPaymentStatus');

let mockCurrentUser: FirebaseAuthTypes.User | null = null;
let mockAuthListenerCallback: ((user: FirebaseAuthTypes.User | null) => void) | null = null;

jest.mock('@react-native-firebase/auth', () => {
  const actualAuth = jest.requireActual('@react-native-firebase/auth');
  return {
    __esModule: true,
    default: () => ({
      onAuthStateChanged: (callback: (user: FirebaseAuthTypes.User | null) => void) => {
        mockAuthListenerCallback = callback;
        // Simulate initial state or a state change if needed immediately
        // callback(mockCurrentUser); 
        return () => { mockAuthListenerCallback = null; }; // Unsubscribe function
      },
      currentUser: mockCurrentUser,
    }),
    // 他に必要なauthのプロパティやメソッドがあれば追加
    FirebaseAuthTypes: actualAuth.FirebaseAuthTypes, // エラー回避のため追加
  };
});

// NavigationContainerのモック (childrenをそのままレンダリング)
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    NavigationContainer: ({ children }: {children: React.ReactNode}) => <>{children}</>,
  };
});

// --- Helper to simulate auth state change ---
const simulateAuthStateChange = (user: FirebaseAuthTypes.User | null) => {
  act(() => {
    mockCurrentUser = user;
    if (mockAuthListenerCallback) {
      mockAuthListenerCallback(user);
    }
  });
};

// --- Test Suite ---
describe('<AppNavigator />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsUserInactive.mockResolvedValue(false); // Default to active
    mockGetUserPaymentStatus.mockResolvedValue({ status: 'paid', paymentId: 'pid123' }); // Default to paid
    mockCurrentUser = null; // Reset user for each test
    if (mockAuthListenerCallback) mockAuthListenerCallback(null); // Reset listener
  });

  it('初期ロード中（認証状態確認中）はAuthLoadingScreenを表示', () => {
    const { getByText } = render(
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    );
    expect(getByText('AuthLoadingScreen')).toBeTruthy();
  });

  it('未認証ユーザーの場合、LoginScreenを表示', async () => {
    render(
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      );
    simulateAuthStateChange(null);
    await waitFor(() => expect(mockIsUserInactive).not.toHaveBeenCalled()); // ユーザーがいないので呼ばれない
    await waitFor(() => expect(mockGetUserPaymentStatus).not.toHaveBeenCalled());
    await waitFor(() => {
      const { getByText } = render(
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      );
      expect(getByText('LoginScreen')).toBeTruthy();
    });
  });

  describe('認証済みユーザー', () => {
    const mockUser = { uid: 'authed-user' } as FirebaseAuthTypes.User;

    it('支払い済みかつアクティブな場合、MainScreen(Home)を表示', async () => {
        render(<AuthProvider><AppNavigator /></AuthProvider>);
        simulateAuthStateChange(mockUser);

        await waitFor(() => expect(mockIsUserInactive).toHaveBeenCalled());
        await waitFor(() => expect(mockGetUserPaymentStatus).toHaveBeenCalled());
        
        const { getByText } = render(<AuthProvider><AppNavigator /></AuthProvider>); 
        await waitFor(() => {
          expect(getByText('MainScreen')).toBeTruthy();
        });
    });

    it('未支払いの場合、DepositScreenを表示', async () => {
      mockGetUserPaymentStatus.mockResolvedValue({ status: 'unpaid', paymentId: null });
      render(<AuthProvider><AppNavigator /></AuthProvider>);
      simulateAuthStateChange(mockUser);

      await waitFor(() => expect(mockIsUserInactive).toHaveBeenCalled());
      await waitFor(() => expect(mockGetUserPaymentStatus).toHaveBeenCalled());

      const { getByText } = render(<AuthProvider><AppNavigator /></AuthProvider>); 
      await waitFor(() => {
        expect(getByText('DepositScreen')).toBeTruthy();
      });
    });

    it('非アクティブな場合、DepositScreenを表示', async () => {
      mockIsUserInactive.mockResolvedValue(true);
      render(<AuthProvider><AppNavigator /></AuthProvider>);
      simulateAuthStateChange(mockUser);
      
      await waitFor(() => expect(mockIsUserInactive).toHaveBeenCalled());
      await waitFor(() => expect(mockGetUserPaymentStatus).toHaveBeenCalled());
      
      const { getByText } = render(<AuthProvider><AppNavigator /></AuthProvider>); 
      await waitFor(() => {
        expect(getByText('DepositScreen')).toBeTruthy();
      });
    });

    it('ユーザー状態チェック中にエラーが発生した場合、MainScreen(Home)にフォールバック', async () => {
      mockIsUserInactive.mockRejectedValueOnce(new Error('Status check error'));
      render(<AuthProvider><AppNavigator /></AuthProvider>);
      simulateAuthStateChange(mockUser);

      await waitFor(() => expect(mockIsUserInactive).toHaveBeenCalled());
      const { getByText } = render(<AuthProvider><AppNavigator /></AuthProvider>); 
      await waitFor(() => {
        expect(getByText('MainScreen')).toBeTruthy();
      });
    });
  });

  describe('AuthProvider and useAuth', () => {
    it('AuthProvider内でuseAuthを使用するとcontext値を返す', () => {
      const TestComponent = () => {
        const { user, isLoading } = useAuth();
        return user ? user.uid : (isLoading ? 'Loading' : 'NoUser');
      };
      const { getByText } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      expect(getByText('Loading')).toBeTruthy(); 
    });

    it('AuthProvider外でuseAuthを使用するとエラーをスローする', () => {
      const TestComponent = () => {
        try {
          useAuth();
        } catch (e: any) {
          return e.message;
        }
        return 'No error';
      };
      const originalError = console.error;
      console.error = jest.fn();
      const { getByText } = render(<TestComponent />);
      expect(getByText('useAuth must be used within an AuthProvider')).toBeTruthy();
      console.error = originalError;
    });
  });
}); 