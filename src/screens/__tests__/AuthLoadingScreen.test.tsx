import React from 'react';
import { render, screen } from '@testing-library/react-native';
import AuthLoadingScreen from '../AuthLoadingScreen';

describe('AuthLoadingScreen', () => {
  it('正しくレンダリングされ、ActivityIndicatorとLoadingテキストが表示される', () => {
    render(<AuthLoadingScreen />);

    // ActivityIndicatorの存在確認 (testIDなどで特定できるとより良い)
    // 今回はActivityIndicatorコンポーネントが一つだけ表示されることを期待
    const activityIndicator = screen.UNSAFE_getByType('ActivityIndicator'); // RNのActivityIndicatorコンポーネントを直接指定
    expect(activityIndicator).toBeTruthy();
    expect(activityIndicator.props.size).toBe('large');

    // "Loading..." テキストの存在確認
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('スナップショットテスト', () => {
    const tree = render(<AuthLoadingScreen />).toJSON();
    expect(tree).toMatchSnapshot();
  });
}); 