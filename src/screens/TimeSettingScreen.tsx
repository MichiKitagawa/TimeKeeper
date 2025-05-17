import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, Text, HelperText, Provider as PaperProvider } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { validateTimeLimit } from '../utils/validators';
import { setUserInitialTimeLimitAndCreateChallenge, UserTimeSettings } from '../services/userService';
import type { AppStackParamList } from '../navigation/AppNavigator';

// 仮のナビゲーションパラメータリスト（実際のAppStackに合わせて調整が必要）
// type RootStackParamList = {
//   TimeSetting: undefined; // 現在の画面
//   MainScreen: undefined; // 遷移先の画面
//   // 他の画面もここに追加
// };

const TimeSettingScreen = () => {
  const navigation = useNavigation<StackNavigationProp<AppStackParamList, 'TimeSettingScreen'>>();
  const [timeLimit, setTimeLimit] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTimeLimitChange = (text: string) => {
    setTimeLimit(text);
    if (text === '') { // 入力が空になったらエラーも消す
      setError(null);
    } else {
      setError(validateTimeLimit(text));
    }
  };

  const handleConfirm = async () => {
    const validationError = validateTimeLimit(timeLimit);
    if (validationError) {
      setError(validationError);
      Alert.alert('入力エラー', validationError);
      return;
    }
    if (!timeLimit) { // timeLimitが空の場合の追加チェック
        Alert.alert('入力エラー', '上限時間を入力してください。');
        return;
    }

    setIsLoading(true);
    try {
      const settings: UserTimeSettings = {
        initialLimitMinutes: parseInt(timeLimit, 10),
      };
      await setUserInitialTimeLimitAndCreateChallenge(settings);
      console.log('時間設定完了、支払い画面へ遷移します。');
      navigation.replace('Deposit');
    } catch (e: any) {
      console.error('時間設定保存エラー:', e);
      Alert.alert('エラー', e.message || '時間設定の保存に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PaperProvider>
      <View style={styles.container}>
        <Text style={styles.title}>時間設定</Text>
        <Text style={styles.subtitle}>
          1日の利用上限時間を設定してください (1分から1440分)。
        </Text>
        <TextInput
          label="上限時間 (分)"
          value={timeLimit}
          onChangeText={handleTimeLimitChange}
          keyboardType="numeric"
          style={styles.input}
          error={!!error}
        />
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>

        <Button 
          mode="contained" 
          onPress={handleConfirm} 
          style={styles.button}
          disabled={!!error || isLoading || !timeLimit}
        >
          {isLoading ? '処理中...' : '決定して進む'}
        </Button>
      </View>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
    color: 'gray',
  },
  input: {
    marginBottom: 4,
  },
  button: {
    marginTop: 16,
  },
});

export default TimeSettingScreen; 