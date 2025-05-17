import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import TimeSettingScreen from '../TimeSettingScreen';
import * as userService from '../../services/userService';
import * as validators from '../../utils/validators';
import { Alert } from 'react-native';

// --- Mocks ---
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

const mockSetUserInitialTimeLimit = jest.spyOn(userService, 'setUserInitialTimeLimitAndCreateChallenge');
const mockValidateTimeLimit = jest.spyOn(validators, 'validateTimeLimit');
jest.spyOn(Alert, 'alert');

// --- Test Suite ---
describe('<TimeSettingScreen />', () => {
  const mockNavigate = jest.fn();
  const mockUseNavigation = require('@react-navigation/native').useNavigation;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNavigation.mockReturnValue({ navigate: mockNavigate });
    mockSetUserInitialTimeLimit.mockResolvedValue('new-challenge-id'); // Default success
    mockValidateTimeLimit.mockReturnValue(null); // Default valid
  });

  it('正常にレンダリングされる', () => {
    const { getByText, getByLabelText } = render(<TimeSettingScreen />);
    expect(getByText('時間設定')).toBeTruthy();
    expect(getByText(/1日の利用上限時間を設定してください/)).toBeTruthy();
    expect(getByLabelText('上限時間 (分)')).toBeTruthy();
    expect(getByText('決定して進む')).toBeTruthy();
  });

  describe('時間入力とバリデーション', () => {
    it('有効な時間を入力するとエラーなし', () => {
      const { getByLabelText, queryByText } = render(<TimeSettingScreen />);
      fireEvent.changeText(getByLabelText('上限時間 (分)'), '60');
      expect(mockValidateTimeLimit).toHaveBeenCalledWith('60');
      expect(queryByText(/1以上1440以下の数値を入力してください。/)).toBeNull(); // エラーメッセージがないことを確認
    });

    it('無効な時間を入力するとエラーメッセージを表示', () => {
      mockValidateTimeLimit.mockReturnValueOnce('無効な時間です');
      const { getByLabelText, getByText } = render(<TimeSettingScreen />);
      fireEvent.changeText(getByLabelText('上限時間 (分)'), 'abc');
      expect(mockValidateTimeLimit).toHaveBeenCalledWith('abc');
      expect(getByText('無効な時間です')).toBeTruthy();
    });

    it('入力が空になるとエラーメッセージも消える', () => {
        mockValidateTimeLimit.mockReturnValueOnce('無効な時間です');
        const { getByLabelText, queryByText } = render(<TimeSettingScreen />); 
        fireEvent.changeText(getByLabelText('上限時間 (分)'), 'abc');
        expect(queryByText('無効な時間です')).toBeTruthy();
        fireEvent.changeText(getByLabelText('上限時間 (分)'), '');
        expect(queryByText('無効な時間です')).toBeNull();
    });
  });

  describe('決定ボタンの処理', () => {
    it('バリデーションエラーがある場合、アラートを表示し送信しない', async () => {
      mockValidateTimeLimit.mockReturnValueOnce('入力エラーテスト');
      const { getByText, getByLabelText } = render(<TimeSettingScreen />);
      fireEvent.changeText(getByLabelText('上限時間 (分)'), 'invalid');
      fireEvent.press(getByText('決定して進む'));

      expect(Alert.alert).toHaveBeenCalledWith('入力エラー', '入力エラーテスト');
      expect(mockSetUserInitialTimeLimit).not.toHaveBeenCalled();
    });

    it('入力が空の場合、アラートを表示し送信しない', async () => {
        const { getByText } = render(<TimeSettingScreen />);
        fireEvent.press(getByText('決定して進む'));
  
        expect(Alert.alert).toHaveBeenCalledWith('入力エラー', '上限時間を入力してください。');
        expect(mockSetUserInitialTimeLimit).not.toHaveBeenCalled();
      });

    it('成功時、userServiceを呼び出しHomeに遷移する', async () => {
      const { getByText, getByLabelText } = render(<TimeSettingScreen />);
      fireEvent.changeText(getByLabelText('上限時間 (分)'), '120');
      fireEvent.press(getByText('決定して進む'));

      expect(mockSetUserInitialTimeLimit).toHaveBeenCalledWith({ initialLimitMinutes: 120 });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Home'));
      expect(Alert.alert).toHaveBeenCalledWith('設定完了', '時間の初期設定が完了しました。メイン画面に進みます。');
    });

    it('userServiceでエラーが発生した場合、エラーアラートを表示する', async () => {
      mockSetUserInitialTimeLimit.mockRejectedValueOnce(new Error('設定保存失敗'));
      const { getByText, getByLabelText } = render(<TimeSettingScreen />);
      fireEvent.changeText(getByLabelText('上限時間 (分)'), '90');
      fireEvent.press(getByText('決定して進む'));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('エラー', '設定保存失敗'));
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('処理中はボタンのテキストが「処理中...」になり無効化される', async () => {
    mockSetUserInitialTimeLimit.mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve('challenge-id'), 100))
    );
    const { getByText, getByLabelText } = render(<TimeSettingScreen />); 
    fireEvent.changeText(getByLabelText('上限時間 (分)'), '30');
    fireEvent.press(getByText('決定して進む'));

    expect(getByText('処理中...')).toBeTruthy();
    expect(getByText('処理中...').props.disabled).toBe(true);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled()); // 処理完了を待つ
  });
}); 