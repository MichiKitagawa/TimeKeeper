import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import LoginScreen from '../LoginScreen';
import * as authService from '../../services/authService';
import { Alert } from 'react-native';

// Alert.alert と console.log をモック
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Alert.alert = jest.fn();
  return RN;
});
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

// authService の signInAnonymously をモック
jest.mock('../../services/authService', () => ({
  signInAnonymously: jest.fn(),
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    // 各テストの前にモックをクリア
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByText, getByRole } = render(<LoginScreen />);
    expect(getByText('Login Screen')).toBeTruthy();
    // React Native Testing Library v12以降では getByRole('button', { name: ... }) が推奨
    // ですが、Buttonコンポーネントのアクセシビリティロールは環境によって異なる場合があるため、
    // getByText でボタンのタイトルを検索する方が安定する場合があります。
    // ここでは、title prop を持つコンポーネントを探す想定で getByText を使用します。
    expect(getByText('Login (Anonymous)')).toBeTruthy(); 
  });

  it('calls signInAnonymously on login button press and logs on success', async () => {
    const mockUser = { uid: 'test-uid' };
    (authService.signInAnonymously as jest.Mock).mockResolvedValue(mockUser);

    const { getByText } = render(<LoginScreen />);
    const loginButton = getByText('Login (Anonymous)');

    await act(async () => {
      fireEvent.press(loginButton);
    });

    expect(authService.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith('Anonymous login successful, user UID:', 'test-uid');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('calls signInAnonymously on login button press and alerts on failure', async () => {
    (authService.signInAnonymously as jest.Mock).mockResolvedValue(null);

    const { getByText } = render(<LoginScreen />);
    const loginButton = getByText('Login (Anonymous)');

    await act(async () => {
      fireEvent.press(loginButton);
    });

    expect(authService.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('Login Failed', 'Could not sign in anonymously.');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('matches snapshot', () => {
    const tree = render(<LoginScreen />).toJSON();
    expect(tree).toMatchSnapshot();
  });
}); 