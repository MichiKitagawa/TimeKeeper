import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import CompletionScreen from '../CompletionScreen';
import * as userService from '../../services/userService';
import { Alert } from 'react-native';

// --- Mocks ---
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      dispatch: jest.fn(),
      goBack: jest.fn(),
    }),
    useRoute: () => ({
      params: { challengeId: 'test-challenge-id' }, // デフォルトで challengeId を提供
    }),
    StackActions: {
      replace: jest.fn((routeName) => ({ type: 'REPLACE', payload: { name: routeName }})),
    },
  };
});

jest.mock('../../navigation/AppNavigator', () => ({
  useAuth: () => ({ user: { uid: 'test-user-id' } }), // デフォルトで認証済みユーザーを提供
}));

jest.spyOn(userService, 'requestRefund');
jest.spyOn(userService, 'continueChallenge');
jest.spyOn(Alert, 'alert');

// --- Test Suite ---
describe('<CompletionScreen />', () => {
  const mockNavigate = jest.fn();
  const mockDispatch = jest.fn();
  const mockGoBack = jest.fn();
  const mockUseNavigation = require('@react-navigation/native').useNavigation;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // useNavigation のモックを各テストの前に再設定
    mockUseNavigation.mockReturnValue({
        navigate: mockNavigate,
        dispatch: mockDispatch,
        goBack: mockGoBack,
    });
    // userService のモック関数のデフォルト挙動
    (userService.requestRefund as jest.Mock).mockResolvedValue({ message: '返金処理を受け付けました。' });
    (userService.continueChallenge as jest.Mock).mockResolvedValue(undefined);
  });

  it('正常にレンダリングされる', () => {
    const { getByText } = render(<CompletionScreen />);
    expect(getByText('チャレンジ完了！')).toBeTruthy();
    expect(getByText('おめでとうございます！現在のチャレンジを完了しました。')).toBeTruthy();
    expect(getByText('退会して返金手続きへ')).toBeTruthy();
    expect(getByText('新しいチャレンジを始める')).toBeTruthy();
  });

  it('challengeId がない場合、エラーメッセージと戻るボタンを表示する', () => {
    require('@react-navigation/native').useRoute.mockReturnValueOnce({ params: {} }); // challengeIdなし
    const { getByText } = render(<CompletionScreen />);
    expect(getByText('エラー')).toBeTruthy();
    expect(getByText('チャレンジ情報が見つかりません。')).toBeTruthy();
    expect(getByText('戻る')).toBeTruthy();
    expect(getByText('チャレンジ完了！')).toBeNull(); // 完了メッセージは表示されない
  });

  it('戻るボタンを押すとgoBackが呼ばれる', () => {
    require('@react-navigation/native').useRoute.mockReturnValueOnce({ params: {} });
    const { getByText } = render(<CompletionScreen />);
    fireEvent.press(getByText('戻る'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  describe('返金処理 (handleRefund)', () => {
    it('成功時、requestRefund を呼び出し、AuthLoading に遷移する', async () => {
      const { getByText } = render(<CompletionScreen />);
      fireEvent.press(getByText('退会して返金手続きへ'));
      
      expect(userService.requestRefund).toHaveBeenCalledWith('test-user-id', 'test-challenge-id');
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('返金処理受付', '返金処理を受け付けました。'));
      await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'REPLACE', payload: { name: 'AuthLoading' } })));
    });

    it('失敗時、エラーアラートを表示する', async () => {
      (userService.requestRefund as jest.Mock).mockRejectedValueOnce(new Error('Refund failed'));
      const { getByText } = render(<CompletionScreen />);
      fireEvent.press(getByText('退会して返金手続きへ'));

      expect(userService.requestRefund).toHaveBeenCalledWith('test-user-id', 'test-challenge-id');
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('エラー', 'Refund failed'));
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('ユーザー情報がない場合、アラートを表示し処理を中断する', async () => {
        require('../../navigation/AppNavigator').useAuth.mockReturnValueOnce({ user: null });
        const { getByText } = render(<CompletionScreen />);
        fireEvent.press(getByText('退会して返金手続きへ'));
        
        await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('エラー', 'ユーザー情報またはチャレンジ情報が取得できませんでした。'));
        expect(userService.requestRefund).not.toHaveBeenCalled();
        expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  describe('継続処理 (handleContinue)', () => {
    it('成功時、continueChallenge を呼び出し、Deposit に遷移する', async () => {
      const { getByText } = render(<CompletionScreen />);
      fireEvent.press(getByText('新しいチャレンジを始める'));

      expect(userService.continueChallenge).toHaveBeenCalledWith('test-user-id', 'test-challenge-id');
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('継続処理完了', '新しいチャレンジを開始するために、頭金設定画面へ移動します。'));
      await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'REPLACE', payload: { name: 'Deposit' } })));
    });

    it('失敗時、エラーアラートを表示する', async () => {
      (userService.continueChallenge as jest.Mock).mockRejectedValueOnce(new Error('Continue failed'));
      const { getByText } = render(<CompletionScreen />);
      fireEvent.press(getByText('新しいチャレンジを始める'));

      expect(userService.continueChallenge).toHaveBeenCalledWith('test-user-id', 'test-challenge-id');
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('エラー', 'Continue failed'));
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  it('処理中はローディングインジケーターを表示する', async () => {
    // requestRefund が解決する前にローディング状態を確認
    (userService.requestRefund as jest.Mock).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({ message: 'ok' }), 100))
    );
    const { getByText, queryByTestId, getByTestId } = render(<CompletionScreen />); 
    // ActivityIndicator には testID を付与する必要があるかもしれない。 
    // react-native-paper の ActivityIndicator はデフォルトで testID がつかないため、親のViewで確認する。
    // ここでは簡易的にボタンが無効化されるかで確認
    
    // actで囲むことでstateの更新を確実にする
    await act(async () => {
        fireEvent.press(getByText('退会して返金手続きへ'));
    });

    // ローディング中はボタンが無効になっているはず
    expect(getByText('退会して返金手続きへ').props.disabled).toBe(true);
    expect(getByText('新しいチャレンジを始める').props.disabled).toBe(true);
    
    // ActivityIndicatorの存在確認 (DOM構造に依存しない形が良いが、ここでは簡易的に)
    // もしActivityIndicator自体をtestIDで見つけたい場合は、CompletionScreen.tsx側でtestIDを付与する
    // 今回はボタンのdisabled状態でローディング状態を判断

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled()); // 処理完了を待つ
  });
}); 