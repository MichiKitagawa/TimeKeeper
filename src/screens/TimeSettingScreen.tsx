import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, Text, HelperText, Provider as PaperProvider } from 'react-native-paper';
// import { useNavigation } from '@react-navigation/native'; // 次のタスクで使用
// import type { StackNavigationProp } from '@react-navigation/stack'; // 次のタスクで使用
import { validateTimeLimit } from '../utils/validators';

// 仮のナビゲーションパラメータリスト（実際のAppStackに合わせて調整が必要）
// type RootStackParamList = {
//   TimeSetting: undefined; // 現在の画面
//   MainScreen: undefined; // 遷移先の画面
//   // 他の画面もここに追加
// };

const TimeSettingScreen = () => {
  // const navigation = useNavigation<StackNavigationProp<RootStackParamList>>(); // 次のタスクで使用
  const [timeLimit, setTimeLimit] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // 次のタスクで使用

  const handleTimeLimitChange = (text: string) => {
    setTimeLimit(text);
    setError(validateTimeLimit(text));
  };

  const handleConfirm = () => {
    const validationError = validateTimeLimit(timeLimit);
    if (validationError) {
      setError(validationError);
      Alert.alert('入力エラー', validationError);
      return;
    }
    // 次のタスクでFirestoreへの保存処理と画面遷移を実装
    console.log('設定時間:', parseInt(timeLimit, 10));
    Alert.alert('設定仮保存', `上限時間を ${timeLimit} 分に設定しました。（実際にはまだ保存されていません）`);
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
          決定して進む
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