import auth from '@react-native-firebase/auth';
import { signInAnonymously, signOut } from '../authService';

// 新しいモック方法
const mockSignInAnonymously = jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } }));
const mockSignOut = jest.fn(() => Promise.resolve());
const mockOnAuthStateChanged = jest.fn(() => jest.fn()); // unsubscribe function

jest.mock('@react-native-firebase/auth', () => {
  return jest.fn(() => ({ // auth() の呼び出しをモック
    signInAnonymously: mockSignInAnonymously,
    signOut: mockSignOut,
    onAuthStateChanged: mockOnAuthStateChanged,
  }));
});

describe('authService', () => {
  beforeEach(() => {
    mockSignInAnonymously.mockClear();
    mockSignOut.mockClear();
    mockOnAuthStateChanged.mockClear();
    // console.log('mockSignInAnonymously before test:', mockSignInAnonymously.mock);
  });

  describe('signInAnonymously', () => {
    it('匿名認証に成功し、ユーザー情報を返す', async () => {
      // console.log('mockSignInAnonymously in test before call:', mockSignInAnonymously.mock);
      const user = await signInAnonymously();
      // console.log('mockSignInAnonymously in test after call:', mockSignInAnonymously.mock);
      // console.log('User result:', user);

      expect(mockSignInAnonymously).toHaveBeenCalledTimes(1); // アサーションの対象を変更
      expect(user).toEqual({ uid: 'test-uid' });
    });

    it('匿名認証に失敗した場合、nullを返す', async () => {
      mockSignInAnonymously.mockRejectedValueOnce(new Error('Auth error'));
      const user = await signInAnonymously();
      expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
      expect(user).toBeNull();
    });

    it('匿名認証が無効な場合、コンソールにログを出力しnullを返す', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      mockSignInAnonymously.mockRejectedValueOnce({ code: 'auth/operation-not-allowed' });
      const user = await signInAnonymously();
      expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
      expect(user).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Enable anonymous sign-in in your Firebase console.');
      consoleSpy.mockRestore();
    });
  });

  describe('signOut', () => {
    it('サインアウト処理を呼び出す', async () => {
      await signOut();
      expect(mockSignOut).toHaveBeenCalledTimes(1); // アサーションの対象を変更
    });

    it('サインアウト処理に失敗した場合、エラーをコンソールに出力する', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error');
      mockSignOut.mockRejectedValueOnce(new Error('Sign out error'));
      await signOut();
      expect(mockSignOut).toHaveBeenCalledTimes(1); // アサーションの対象を変更
      expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('Sign out error'));
      consoleErrorSpy.mockRestore();
    });
  });
}); 