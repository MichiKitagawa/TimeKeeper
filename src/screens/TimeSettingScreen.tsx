import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { TextInput, Button, Text, HelperText, Provider as PaperProvider, Card, Title } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { setUserInitialTimeLimitAndCreateChallenge, UserTimeSettings, AppUsageLimits } from '../services/userService';
import { getAppUsageStats, AppUsageStatsData } from '../services/usageTrackingService';
import type { AppStackParamList } from '../navigation/AppNavigator';

const TimeSettingScreen = () => {
  const navigation = useNavigation<StackNavigationProp<AppStackParamList, 'TimeSettingScreen'>>();
  const [appTimeLimits, setAppTimeLimits] = useState<AppUsageLimits>({});
  const [error, setError] = useState<string | null>(null);
  const [appErrors, setAppErrors] = useState<{[key: string]: string | null | undefined}>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingApps, setIsFetchingApps] = useState(true);
  const [availableApps, setAvailableApps] = useState<AppUsageStatsData[]>([]);

  useEffect(() => {
    const fetchUsedApps = async () => {
      setIsFetchingApps(true);
      setError(null);
      try {
        const today = new Date();
        const sevenDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
        const usedApps = await getAppUsageStats(sevenDaysAgo, today);
        
        const uniqueApps = usedApps.reduce((acc, current) => {
          if (!acc.find(app => app.packageName === current.packageName)) {
            acc.push(current);
          }
          return acc;
        }, [] as AppUsageStatsData[]);

        setAvailableApps(uniqueApps);
        if (uniqueApps.length === 0) {
          setError("過去7日間に利用記録のあるアプリが見つかりませんでした。");
        }
      } catch (e) {
        console.error("Failed to fetch used apps:", e);
        setError("利用実績のあるアプリ一覧の取得に失敗しました。");
        setAvailableApps([]);
      } finally {
        setIsFetchingApps(false);
      }
    };
    fetchUsedApps();
  }, []);

  const validateIndividualTimeLimit = (timeLimit: string, allowZero: boolean = true): string | null => {
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

  const handleAppTimeLimitChange = (packageName: string, text: string) => {
    const newAppTimeLimits = { ...appTimeLimits };
    if (text === '' || text === undefined) {
      delete newAppTimeLimits[packageName];
    } else {
      const parsedValue = parseInt(text, 10);
      if (!isNaN(parsedValue)) {
        newAppTimeLimits[packageName] = parsedValue;
      } else {
        delete newAppTimeLimits[packageName];
      }
    }
    setAppTimeLimits(newAppTimeLimits);

    const appValidationError = validateIndividualTimeLimit(text, true);
    setAppErrors(prev => ({...prev, [packageName]: appValidationError }));
  };
  

  const handleConfirm = async () => {
    let hasAppError = false;
    const finalAppTimeLimits: AppUsageLimits = {};
    for (const app of availableApps) {
      const packageName = app.packageName;
      const limitValue = appTimeLimits[packageName];
      const textValue = limitValue === undefined || limitValue === null ? '' : limitValue.toString();
      const appValidationError = validateIndividualTimeLimit(textValue, true);
      if (appValidationError) {
        setAppErrors(prev => ({...prev, [packageName]: appValidationError}));
        hasAppError = true;
      }
      if (limitValue !== undefined && !isNaN(limitValue) && !appValidationError) {
        finalAppTimeLimits[packageName] = limitValue;
      } else if (limitValue === undefined && !appValidationError) {
        // 未入力（制限なし）の場合もエラーではない。finalAppTimeLimitsには追加しない。
      }
    }

    if(hasAppError){
      Alert.alert('入力エラー', 'アプリ別目標時間の設定に誤りがあります。');
      return;
    }
    
    const calculatedTotalTimeLimit = Object.values(finalAppTimeLimits).reduce((sum, time) => sum + (isNaN(time) ? 0 : time), 0);

    if (calculatedTotalTimeLimit === 0 && Object.keys(finalAppTimeLimits).length > 0) {
        // 何かアプリが選択されているが、全て0分の場合。
        // 少なくとも1つのアプリに0より大きい目標時間を設定してもらうか、確認を促す。
        // ここでは、少なくとも1つは0より大きい値が必要と判断する。
        // ただし、全てのアプリを制限対象外（未入力）とする場合はこの限りではない。
        // finalAppTimeLimitsが空の場合は、何も設定しないと解釈できる。
    } else if (Object.keys(finalAppTimeLimits).length === 0) {
      Alert.alert('設定なし', '目標時間を設定するアプリがありません。利用履歴のあるアプリが表示されない場合、しばらくアプリを利用してから再度お試しください。');
      // return; // 何も設定せずに進むことを許容するかどうか
    }
    
    setIsLoading(true);
    try {
      const settings: UserTimeSettings = {
        totalInitialLimitMinutes: calculatedTotalTimeLimit,
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

  const isAnyAppError = availableApps.some(app => !!appErrors[app.packageName]);

  if (isFetchingApps) {
    return (
      <PaperProvider>
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text>利用可能なアプリを読み込み中...</Text>
        </View>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.container}>
          <Text style={styles.title}>アプリ別 目標時間設定</Text>
          
          {error && <HelperText type="error" visible={!!error} style={styles.generalErrorText}>{error}</HelperText>}

          {availableApps.length > 0 ? (
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.cardTitle}>アプリごとの目標時間 (分)</Title>
                <Text style={styles.subtitle}>
                  1日の利用目標時間をアプリごとに設定します (0分から1440分)。未入力の場合は制限なしとして扱われます。
                </Text>
                {availableApps.map((app) => (
                  <View key={app.packageName} style={styles.appLimitRow}>
                    <Text style={styles.appLabel}>{app.appName || app.packageName} (分):</Text>
                    <TextInput
                      label={`${app.appName || app.packageName} (分)`}
                      value={appTimeLimits[app.packageName]?.toString() ?? ''}
                      onChangeText={(text) => handleAppTimeLimitChange(app.packageName, text)}
                      keyboardType="numeric"
                      style={styles.appInput}
                      dense
                      error={!!appErrors[app.packageName]}
                    />
                    <HelperText type="error" visible={!!appErrors[app.packageName]} style={styles.appErrorText}>{appErrors[app.packageName]}</HelperText>
                  </View>
                ))}
              </Card.Content>
            </Card>
          ) : (
            !isFetchingApps && !error && (
              <Card style={styles.card}>
                <Card.Content>
                  <Text style={styles.noAppsText}>過去7日間に利用記録のあるアプリが見つかりませんでした。スマートフォンをご利用後、再度お試しください。</Text>
                </Card.Content>
              </Card>
            )
          )}

          <Button 
            mode="contained" 
            onPress={handleConfirm} 
            style={styles.button}
            disabled={isLoading || isFetchingApps || !!error || isAnyAppError || availableApps.length === 0}
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
    backgroundColor: '#f0f0f0',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'left',
    color: '#555',
  },
  card: {
    marginBottom: 20,
    elevation: 1,
    borderRadius: 8,
  },
  cardTitle: {
    fontSize: 18,
    marginBottom: 10,
    fontWeight: '600',
  },
  input: {
    marginBottom: 4,
  },
  button: {
    marginTop: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  appLimitRow: {
    marginBottom: 15,
  },
  appLabel: {
    fontSize: 16,
    marginBottom: 6,
    color: '#444',
  },
  appInput: {
    backgroundColor: '#fff',
  },
  appErrorText: {
    fontSize: 12,
    paddingLeft: 2,
  },
  generalErrorText: {
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 16,
  },
  noAppsText: {
    textAlign: 'center',
    fontSize: 16,
    paddingVertical: 20,
    color: '#666',
  }
});

export default TimeSettingScreen; 