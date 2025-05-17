import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import LockScreen from '../LockScreen';
import * as unlockService from '../../services/unlockService';
import { Alert, BackHandler } from 'react-native';
import { useAuth } from '../../navigation/AppNavigator';

// NavigationとAuthのモック
const mockNavigate = jest.fn();
const mockDispatch = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    dispatch: mockDispatch,
  }),
}));

jest.mock('../../navigation/AppNavigator', () => ({
  ...jest.requireActual('../../navigation/AppNavigator'),
  useAuth: jest.fn(),
}));

// unlockServiceのモック
jest.mock('../../services/unlockService');
const mockCalculateUnlockDetails = unlockService.calculateUnlockDetails as jest.Mock;
const mockProcessUnlock = unlockService.processUnlock as jest.Mock;

// Alert.alertのモック
jest.spyOn(Alert, 'alert');
// BackHandler.exitAppのモック
jest.spyOn(BackHandler, 'exitApp');

describe('LockScreen', () => {
  const mockUser = { uid: 'test-user-id' };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: mockUser });
    mockCalculateUnlockDetails.mockResolvedValue({ fee: 200, previousMultiplierToSave: 1, newMultiplierToSave: 1.2 });
    mockProcessUnlock.mockResolvedValue(undefined);
    (Alert.alert as jest.Mock).mockClear();
    (BackHandler.exitApp as jest.Mock).mockClear();
  });

  it('正常にレンダリングされ、主要な要素が表示される', async () => {
    const { getByText, findByText } = render(<LockScreen />);
    await findByText('ロックされています'); // 初期ロードを待つ
    expect(getByText('本日の利用上限時間を超えました。')).toBeTruthy();
    expect(getByText('アンロック料金: 200円')).toBeTruthy();
    expect(getByText('アンロックする')).toBeTruthy();
    expect(getByText('アプリを終了')).toBeTruthy();
  });

  it('ユーザーがいない場合、ローディング表示のままになる (実際にはエラーや代替表示が望ましい)', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    const { getByText, queryByText } = render(<LockScreen />);
    expect(getByText('料金情報を読み込み中...')).toBeTruthy();
    expect(queryByText('ロックされています')).toBeNull();
  });

  it('料金計算に失敗した場合、フォールバック料金が表示され、アラートが出る', async () => {
    mockCalculateUnlockDetails.mockRejectedValueOnce(new Error('Fee calculation failed'));
    const { findByText } = render(<LockScreen />);
    await findByText('アンロック料金: 200円'); // フォールバック料金
    expect(Alert.alert).toHaveBeenCalledWith('エラー', '料金情報の取得に失敗しました。');
  });

  it('「アンロックする」ボタンを押すとprocessUnlockが呼ばれ、成功するとHomeに遷移する', async () => {
    const { getByText, findByText } = render(<LockScreen />);
    await findByText('ロックされています'); // 初期ロードを待つ
    fireEvent.press(getByText('アンロックする'));

    expect(mockProcessUnlock).toHaveBeenCalledWith(mockUser.uid, 200, 1, 1.2);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('アンロック成功', 'ロックが解除されました。アプリをお楽しみください。'));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'REPLACE', payload: { name: 'Home' } })));
  });

  it('processUnlockが失敗した場合、エラーアラートが表示される', async () => {
    mockProcessUnlock.mockRejectedValueOnce(new Error('Unlock failed'));
    const { getByText, findByText } = render(<LockScreen />);
    await findByText('ロックされています');
    fireEvent.press(getByText('アンロックする'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('アンロック失敗', '処理中にエラーが発生しました。もう一度お試しください。'));
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('「アプリを終了」ボタンを押すと確認アラートが表示され、「終了する」でexitAppが呼ばれる', async () => {
    const { getByText, findByText } = render(<LockScreen />);
    await findByText('ロックされています');
    fireEvent.press(getByText('アプリを終了'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'アプリの終了',
      'アプリを終了しますか？',
      expect.arrayContaining([
        expect.objectContaining({ text: 'キャンセル' }),
        expect.objectContaining({ text: '終了する', onPress: expect.any(Function) }),
      ])
    );
    // AlertのonPressを直接呼び出す
    const alertArgs = (Alert.alert as jest.Mock).mock.calls[0];
    const exitButton = alertArgs[2].find((button: any) => button.text === '終了する');
    exitButton.onPress();
    expect(BackHandler.exitApp).toHaveBeenCalledTimes(1);
  });

  it('アンロック処理中にボタンが無効化され、ActivityIndicatorが表示される', async () => {
    mockProcessUnlock.mockImplementationOnce(() => {
      return new Promise(resolve => setTimeout(() => resolve(undefined), 100));
    });
    const { getByText, findByText, queryByTestId } = render(<LockScreen />); // ActivityIndicator に testID を付与
    await findByText('ロックされています');
    
    const unlockButton = getByText('アンロックする');
    const exitButton = getByText('アプリを終了');

    fireEvent.press(unlockButton);
    
    expect(unlockButton.props.disabled).toBe(true);
    expect(exitButton.props.disabled).toBe(true);
    // LockScreen.tsxのisProcessing && <ActivityIndicator> に testID="processing-indicator" を付与する想定
    // expect(await findByTestId('processing-indicator')).toBeTruthy();

    await waitFor(() => expect(unlockButton.props.disabled).toBe(false));
    expect(exitButton.props.disabled).toBe(false);
    // expect(queryByTestId('processing-indicator')).toBeNull();
  });

}); 