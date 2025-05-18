import React, { useState } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { TextInput, Button, Text, HelperText, Provider as PaperProvider, Card, Title } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { validateTimeLimit } from '../utils/validators';
import { setUserInitialTimeLimitAndCreateChallenge, UserTimeSettings, AppUsageLimits } from '../services/userService';
import type { AppStackParamList } from '../navigation/AppNavigator';

// 仮のナビゲーションパラメータリスト（実際のAppStackに合わせて調整が必要）
// type RootStackParamList = {
//   TimeSetting: undefined; // 現在の画面
//   MainScreen: undefined; // 遷移先の画面
//   // 他の画面もここに追加
// };

// 予め定義しておくアプリカテゴリの例
const PREDEFINED_APP_CATEGORIES = ['social', 'game', 'work', 'other'];

const TimeSettingScreen = () => {
  const navigation = useNavigation<StackNavigationProp<AppStackParamList, 'TimeSettingScreen'>>();
  const [totalTimeLimit, setTotalTimeLimit] = useState<string>('');
  const [appTimeLimits, setAppTimeLimits] = useState<AppUsageLimits>({});
  const [error, setError] = useState<string | null>(null);
  const [appErrors, setAppErrors] = useState<{[key: string]: string | null | undefined}>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleTotalTimeLimitChange = (text: string) => {
    setTotalTimeLimit(text);
    setError(text === '' ? null : validateTimeLimit(text));
  };

  const validateIndividualTimeLimit = (timeLimit: string, allowZero: boolean = false): string | null => {
    if (!timeLimit && !allowZero) return '時間を入力してください。';
    if (!timeLimit && allowZero) return null;
    const numericTimeLimit = parseInt(timeLimit, 10);
    if (isNaN(numericTimeLimit)) return '数値を入力してください。';
    if (numericTimeLimit < (allowZero ? 0 : 1) || numericTimeLimit > 1440) {
      return `時間は${allowZero ? 0 : 1}分から1440分の間で設定してください。`;
    }
    if (!Number.isInteger(numericTimeLimit)) return '整数で入力してください。';
    return null;
  };

  const handleAppTimeLimitChange = (appId: string, text: string) => {
    const newAppTimeLimits = { ...appTimeLimits };
    if (text === '' || text === undefined) {
      delete newAppTimeLimits[appId];
    } else {
      const parsedValue = parseInt(text, 10);
      if (!isNaN(parsedValue)) {
        newAppTimeLimits[appId] = parsedValue;
      } else {
        delete newAppTimeLimits[appId];
      }
    }
    setAppTimeLimits(newAppTimeLimits);

    const appValidationError = validateIndividualTimeLimit(text, true);
    setAppErrors(prev => ({...prev, [appId]: appValidationError }));

    const currentTotalAppTime = Object.values(newAppTimeLimits).reduce((sum, time) => sum + (isNaN(time) ? 0 : time), 0);
    const totalLimitNum = parseInt(totalTimeLimit, 10);
    if (!isNaN(totalLimitNum) && currentTotalAppTime > totalLimitNum) {
      setAppErrors(prev => ({...prev, totalAppLimitError: "カテゴリ別目標時間の合計が、全体の目標時間を超えています。"}));
    } else {
      setAppErrors(prev => ({...prev, totalAppLimitError: null}));
    }
  };
  

  const handleConfirm = async () => {
    const totalValidationError = validateTimeLimit(totalTimeLimit);
    if (totalValidationError) {
      setError(totalValidationError);
      Alert.alert('入力エラー', `合計上限時間: ${totalValidationError}`);
      return;
    }
    if (!totalTimeLimit) {
      Alert.alert('入力エラー', '合計の上限時間を入力してください。');
      return;
    }

    let hasAppError = false;
    const finalAppTimeLimits: AppUsageLimits = {};
    for (const cat of PREDEFINED_APP_CATEGORIES) {
      const limitValue = appTimeLimits[cat];
      const textValue = limitValue === undefined ? '' : limitValue.toString();
      const appValidationError = validateIndividualTimeLimit(textValue, true);
      if (appValidationError) {
        setAppErrors(prev => ({...prev, [cat]: appValidationError}));
        hasAppError = true;
      }
      if (limitValue !== undefined && !isNaN(limitValue) && !appValidationError) {
        finalAppTimeLimits[cat] = limitValue;
      }
    }

    if(hasAppError){
      Alert.alert('入力エラー', 'カテゴリ別時間の設定に誤りがあります。');
      return;
    }
    
    const parsedTotalTimeLimit = parseInt(totalTimeLimit, 10);
    const currentTotalAppTime = Object.values(finalAppTimeLimits).reduce((sum, time) => sum + (isNaN(time) ? 0 : time), 0);

    if (currentTotalAppTime > parsedTotalTimeLimit) {
      Alert.alert('入力エラー', 'カテゴリ別目標時間の合計が、全体の目標時間を超えることはできません。');
      setAppErrors(prev => ({...prev, totalAppLimitError: "カテゴリ別目標時間の合計が、全体の目標時間を超えています。"}));
      return;
    }
    setAppErrors(prev => ({...prev, totalAppLimitError: null}));

    setIsLoading(true);
    try {
      const settings: UserTimeSettings = {
        totalInitialLimitMinutes: parsedTotalTimeLimit,
        initialLimitByApp: finalAppTimeLimits,
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

  const totalAppLimitError = appErrors['totalAppLimitError'];
  const isAnyAppError = PREDEFINED_APP_CATEGORIES.some(cat => !!appErrors[cat]);

  return (
    <PaperProvider>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.container}>
          <Text style={styles.title}>目標時間設定</Text>
          
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>1日の合計利用上限</Title>
              <Text style={styles.subtitle}>
                1日の合計スマートフォン利用上限時間を設定してください (1分から1440分)。
              </Text>
              <TextInput
                label="合計上限時間 (分)"
                value={totalTimeLimit}
                onChangeText={handleTotalTimeLimitChange}
                keyboardType="numeric"
                style={styles.input}
                error={!!error}
              />
              <HelperText type="error" visible={!!error}>
                {error}
              </HelperText>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>カテゴリ別上限 (任意)</Title>
              <Text style={styles.subtitle}>
                必要であれば、カテゴリごとの利用上限時間を設定します。未入力の場合は制限なしとして扱われます。合計上限を超えないようにしてください。
              </Text>
              {PREDEFINED_APP_CATEGORIES.map((category) => (
                <View key={category} style={styles.appLimitRow}>
                  <Text style={styles.appLabel}>{category.charAt(0).toUpperCase() + category.slice(1)} (分):</Text>
                  <TextInput
                    label={`${category} (分)`}
                    value={appTimeLimits[category]?.toString() ?? ''}
                    onChangeText={(text) => handleAppTimeLimitChange(category, text)}
                    keyboardType="numeric"
                    style={styles.appInput}
                    dense
                    error={!!appErrors[category]}
                  />
                  <HelperText type="error" visible={!!appErrors[category]} style={styles.appErrorText}>{appErrors[category]}</HelperText>
                </View>
              ))}
              <HelperText type="error" visible={!!totalAppLimitError} style={styles.totalAppErrorText}>{totalAppLimitError}</HelperText>
            </Card.Content>
          </Card>

          <Button 
            mode="contained" 
            onPress={handleConfirm} 
            style={styles.button}
            disabled={!!error || isLoading || !totalTimeLimit || isAnyAppError || !!totalAppLimitError}
          >
            {isLoading ? '処理中...' : '決定して進む'}
          </Button>
        </View>
      </ScrollView>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'left',
    color: 'gray',
  },
  card: {
    marginBottom: 20,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    marginBottom: 8,
  },
  input: {
    marginBottom: 4,
  },
  button: {
    marginTop: 24,
    paddingVertical: 8,
  },
  appLimitRow: {
    marginBottom: 12,
  },
  appLabel: {
    fontSize: 16,
    marginBottom: 4,
    color: '#333',
  },
  appInput: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  appErrorText: {
    fontSize: 12,
  },
  totalAppErrorText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  }
});

export default TimeSettingScreen; 