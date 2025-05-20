import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { TextInput, Button, Text, HelperText, Provider as PaperProvider, Card, Title, Appbar, Subheading, Checkbox } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { setUserInitialTimeLimitAndCreateChallenge, UserTimeSettings, AppUsageLimits, getUserDocument, updateUserDocument } from '../services/userService';
import { getAppUsageStats, AppUsageStatsData } from '../services/usageTrackingService';
import type { AppStackParamList } from '../navigation/AppNavigator';
import * as nativeLockingService from '../services/nativeLockingService';
import type { AppLockInfoNative } from '../services/nativeLockingService';
import auth from '@react-native-firebase/auth';

// nativeLockingServiceから取得するアプリ情報の型
interface NativeInstalledAppInfo {
  appName: string;
  packageName: string;
}

const TimeSettingScreen = () => {
  const navigation = useNavigation<StackNavigationProp<AppStackParamList, 'TimeSettingScreen'>>();
  const currentUser = auth().currentUser;

  const [initialDailyUsageLimits, setInitialDailyUsageLimits] = useState<AppUsageLimits>({});
  const [targetTimeLimits, setTargetTimeLimits] = useState<AppUsageLimits>({});
  const [selectedLockedApps, setSelectedLockedApps] = useState<string[]>([]);
  
  const [error, setError] = useState<string | null>(null);
  const [appErrors, setAppErrors] = useState<{[key: string]: { initial?: string | null, target?: string | null }}>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingApps, setIsFetchingApps] = useState(true);

  interface DisplayAppInfo extends AppUsageStatsData {
    manuallyAdded?: boolean;
    appNameFallback?: string;
  }
  const [displayApps, setDisplayApps] = useState<DisplayAppInfo[]>([]);

  const fetchAppsAndLimits = useCallback(async () => {
    if (!currentUser) {
      Alert.alert("エラー", "ユーザーがログインしていません。");
      setIsFetchingApps(false);
      return;
    }
    setIsFetchingApps(true);
    setError(null);
    setAppErrors({});
    try {
      const today = new Date();
      const sevenDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
      
      const userDocPromise = getUserDocument(currentUser.uid);

      const [userDoc] = await Promise.all([
        userDocPromise,
      ]);

      const usedAppsResult = await getAppUsageStats(sevenDaysAgo, today);
      const manuallyAddedAppsFromDoc: NativeInstalledAppInfo[] = userDoc?.manuallyAddedApps || [];

      const mergedApps: DisplayAppInfo[] = [];
      const packageNames = new Set<string>();

      usedAppsResult.forEach(app => {
        if (!packageNames.has(app.packageName)) {
          mergedApps.push({ ...app, manuallyAdded: false });
          packageNames.add(app.packageName);
        }
      });

      const manuallyAddedAppsForDisplay: DisplayAppInfo[] = manuallyAddedAppsFromDoc.map(manualApp => ({
        packageName: manualApp.packageName,
        appName: manualApp.appName,
        appNameFallback: manualApp.appName,
        totalTimeInForeground: 0,
        lastTimeUsed: 0,
        manuallyAdded: true,
      }));
      
      manuallyAddedAppsForDisplay.forEach(manualApp => {
        if (!packageNames.has(manualApp.packageName)) {
          mergedApps.push(manualApp);
          packageNames.add(manualApp.packageName);
        } else {
          const existingApp = mergedApps.find(app => app.packageName === manualApp.packageName);
          if (existingApp) {
            existingApp.manuallyAdded = true;
            if (!existingApp.appName) existingApp.appName = manualApp.appName;
            existingApp.appNameFallback = manualApp.appName;
          }
        }
      });
      
      mergedApps.sort((a, b) => (a.appName || a.appNameFallback || '').localeCompare(b.appName || b.appNameFallback || ''));

      setDisplayApps(mergedApps);

      if (userDoc && 'lockedApps' in userDoc && Array.isArray(userDoc.lockedApps)) {
        setSelectedLockedApps(userDoc.lockedApps);
      }

      if (mergedApps.length === 0) {
        setError("利用記録のあるアプリ、または手動追加されたアプリがありません。右上の「＋」ボタンからアプリを追加してください。");
      }
    } catch (e) {
      console.error("Failed to fetch apps and limits:", e);
      setError("アプリ一覧または既存設定の取得に失敗しました。");
      setDisplayApps([]);
    } finally {
      setIsFetchingApps(false);
    }
  }, [currentUser]);

  useFocusEffect(
    useCallback(() => {
      fetchAppsAndLimits();
    }, [fetchAppsAndLimits])
  );

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

  const handleInitialLimitChange = (packageName: string, text: string) => {
    const newLimits = { ...initialDailyUsageLimits };
    if (text === '' || text === undefined) {
      delete newLimits[packageName];
    } else {
      const parsedValue = parseInt(text, 10);
      if (!isNaN(parsedValue)) {
        newLimits[packageName] = parsedValue;
      } else {
        delete newLimits[packageName];
      }
    }
    setInitialDailyUsageLimits(newLimits);

    const validationError = validateIndividualTimeLimit(text, true);
    setAppErrors(prev => ({
      ...prev,
      [packageName]: { ...prev[packageName], initial: validationError },
    }));
  };
  
  const handleTargetLimitChange = (packageName: string, text: string) => {
    const newLimits = { ...targetTimeLimits };
    if (text === '' || text === undefined) {
      delete newLimits[packageName];
    } else {
      const parsedValue = parseInt(text, 10);
      if (!isNaN(parsedValue)) {
        newLimits[packageName] = parsedValue;
      } else {
        delete newLimits[packageName];
      }
    }
    setTargetTimeLimits(newLimits);

    const validationError = validateIndividualTimeLimit(text, true);
    setAppErrors(prev => ({
      ...prev,
      [packageName]: { ...prev[packageName], target: validationError },
    }));
  };

  const toggleLockedApp = (packageName: string) => {
    setSelectedLockedApps(prevSelected =>
      prevSelected.includes(packageName)
        ? prevSelected.filter(p => p !== packageName)
        : [...prevSelected, packageName]
    );
  };

  const handleConfirm = async () => {
    let hasError = false;
    const finalInitialDailyUsageLimits: AppUsageLimits = {};
    const finalTargetTimeLimits: AppUsageLimits = {};

    for (const app of displayApps) {
      const pkgName = app.packageName;
      const initialText = initialDailyUsageLimits[pkgName]?.toString() ?? '';
      const targetText = targetTimeLimits[pkgName]?.toString() ?? '';

      const initialError = validateIndividualTimeLimit(initialText, true);
      const isTargetRequired = selectedLockedApps.includes(pkgName);
      const targetError = validateIndividualTimeLimit(targetText, !isTargetRequired);

      if (initialError || targetError) {
        hasError = true;
        setAppErrors(prev => ({
          ...prev,
          [pkgName]: { initial: initialError, target: targetError },
        }));
      }
      
      if (!initialError && initialDailyUsageLimits[pkgName] !== undefined) {
        finalInitialDailyUsageLimits[pkgName] = initialDailyUsageLimits[pkgName];
      }
      if (!targetError) {
        if (targetTimeLimits[pkgName] !== undefined) {
            finalTargetTimeLimits[pkgName] = targetTimeLimits[pkgName];
        } else if (isTargetRequired && (targetText === '' || targetText === undefined)) {
            finalTargetTimeLimits[pkgName] = 0;
        }
      }
    }

    selectedLockedApps.forEach(pkgName => {
        if (appErrors[pkgName]?.target) {
            hasError = true;
        }
        if (!finalTargetTimeLimits.hasOwnProperty(pkgName)) {
             Alert.alert('設定エラー', `${displayApps.find(a=>a.packageName === pkgName)?.appName || pkgName} はロック対象ですが目標時間が設定されていません。0分以上の目標時間を設定してください。`);
             hasError = true;
        }
    });

    if (hasError) {
      Alert.alert('入力エラー', '入力内容に誤りがあります。各項目のエラーメッセージを確認してください。');
      return;
    }

    if (Object.keys(finalInitialDailyUsageLimits).length === 0 && displayApps.length > 0) {
      Alert.alert('設定不足', '少なくとも1つのアプリで「現在の1日の使用時間」を設定してください。');
      return;
    }
    const initialAppsWithTargets = Object.keys(finalInitialDailyUsageLimits).filter(pkg => finalTargetTimeLimits[pkg] !== undefined);
    if (Object.keys(finalInitialDailyUsageLimits).length > 0 && initialAppsWithTargets.length === 0) {
        Alert.alert('目標未設定', '「現在の1日の使用時間」を設定したアプリには、「目標の1日の使用時間」も設定してください（0分も可）。');
        return;
    }

    for (const pkgName in finalInitialDailyUsageLimits) {
      if (finalTargetTimeLimits.hasOwnProperty(pkgName) && 
          finalInitialDailyUsageLimits[pkgName] < finalTargetTimeLimits[pkgName]) {
        setAppErrors(prev => ({
            ...prev,
            [pkgName]: { ...prev[pkgName], target: '目標時間は現在の使用時間以下に設定してください。' },
          }));
        hasError = true;
      }
    }
    if (hasError) {
        Alert.alert('入力エラー', '目標時間は現在の使用時間以下に設定してください。');
        return;
    }

    const calculatedInitialTotal = Object.values(finalInitialDailyUsageLimits).reduce((sum, time) => sum + (isNaN(time) ? 0 : time), 0);
    const calculatedTargetTotal = Object.values(finalTargetTimeLimits).reduce((sum, time) => sum + (isNaN(time) ? 0 : time), 0);

    if (Object.keys(finalInitialDailyUsageLimits).length > 0 && calculatedInitialTotal === 0) {
      Alert.alert('合計時間エラー', '「現在の1日の使用時間」の合計が0分です。少なくとも1つのアプリで0より大きい時間を設定してください。');
      return;
    }

    setIsLoading(true);
    try {
      const settings: UserTimeSettings = {
        initialDailyUsageLimit: {
          total: calculatedInitialTotal,
          byApp: finalInitialDailyUsageLimits,
        },
        targetLimit: {
          total: calculatedTargetTotal,
          byApp: finalTargetTimeLimits,
        },
      };

      if (!currentUser) {
        Alert.alert("エラー", "ユーザーがログインしていません。");
        setIsLoading(false);
        return;
      }
      
      await setUserInitialTimeLimitAndCreateChallenge(currentUser.uid, settings);

      await updateUserDocument(currentUser.uid, { lockedApps: selectedLockedApps });

      const lockedAppsInfoForNative: AppLockInfoNative[] = selectedLockedApps.map(packageName => ({
        packageName,
        limitMinutes: finalTargetTimeLimits[packageName] !== undefined ? finalTargetTimeLimits[packageName] : 0,
      }));

      const lockAppsSetSuccess = await nativeLockingService.setLockedApps(lockedAppsInfoForNative);
      if (!lockAppsSetSuccess) {
        Alert.alert("ネイティブエラー", "ロック対象アプリの設定に失敗しました。");
      }
      const serviceStartSuccess = await nativeLockingService.startLockingService();
      if (!serviceStartSuccess) {
        Alert.alert("ネイティブエラー", "監視サービスの開始に失敗しました。");
      }

      Alert.alert("成功", "時間制限とロック設定が保存されました。");
      navigation.navigate('Deposit');
    } catch (e: any) {
      console.error('時間設定保存エラー:', e);
      Alert.alert('エラー', e.message || '時間設定の保存に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };
  
  const isAnyAppError = displayApps.some(app => 
    appErrors[app.packageName]?.initial || appErrors[app.packageName]?.target
  );

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
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Home')} />
        <Appbar.Content title="利用時間 設定" />
        <Appbar.Action icon="plus-box-multiple" onPress={() => navigation.navigate('AddAppScreen')} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.container}>
          <Title style={styles.title}>アプリごとの利用時間設定</Title>
          <Text style={styles.description}>
            各アプリの「現在の1日の平均的な使用時間」と、「最終的に目指したい目標の1日の使用時間」を分単位で入力してください。
            目標時間に向けて、毎日少しずつ利用可能時間が減っていきます。
            未入力の場合は、そのアプリは時間制限の対象外となります。0分と入力すると、その日の利用を不可にできます。
          </Text>
          
          {error && <HelperText type="error" visible={!!error} style={styles.generalErrorText}>{error}</HelperText>}

          {displayApps.length > 0 ? (
            <Card style={styles.card}>
              <Card.Content>
                {displayApps.map((app) => (
                  <View key={app.packageName} style={styles.appRowContainer}>
                    <Subheading style={styles.appSubheading}>{app.appName || app.appNameFallback || app.packageName}{app.totalTimeInForeground === 0 && app.manuallyAdded ? " (利用履歴なし)" : ""}</Subheading>
                    <View style={styles.inputRow}>
                        <View style={styles.inputContainer}>
                            <TextInput
                                label="現在の使用時間 (分)"
                                value={initialDailyUsageLimits[app.packageName]?.toString() ?? ''}
                                onChangeText={(text) => handleInitialLimitChange(app.packageName, text)}
                                keyboardType="numeric"
                                style={styles.appInput}
                                dense
                                error={!!appErrors[app.packageName]?.initial}
                            />
                            <HelperText type="error" visible={!!appErrors[app.packageName]?.initial} style={styles.appErrorText}>
                                {appErrors[app.packageName]?.initial}
                            </HelperText>
                        </View>
                        <View style={styles.inputContainer}>
                            <TextInput
                                label="目標の使用時間 (分)"
                                value={targetTimeLimits[app.packageName]?.toString() ?? ''}
                                onChangeText={(text) => handleTargetLimitChange(app.packageName, text)}
                                keyboardType="numeric"
                                style={styles.appInput}
                                dense
                                error={!!appErrors[app.packageName]?.target}
                            />
                            <HelperText type="error" visible={!!appErrors[app.packageName]?.target} style={styles.appErrorText}>
                                {appErrors[app.packageName]?.target}
                            </HelperText>
                        </View>
                    </View>
                  </View>
                ))}
              </Card.Content>
            </Card>
          ) : (
            !isFetchingApps && !error && (
              <Card style={styles.card}>
                <Card.Content>
                  <Text style={styles.noAppsText}>監視対象のアプリがありません。右上の「＋」ボタンから手動で追加するか、スマートフォンをご利用後、再度お試しください。</Text>
                </Card.Content>
              </Card>
            )
          )}

          <Button 
            mode="contained" 
            onPress={handleConfirm} 
            style={styles.button}
            disabled={isLoading || isFetchingApps || !!error || isAnyAppError || displayApps.length === 0}
          >
            {isLoading ? '処理中...' : '決定して支払いへ進む'}
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
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#333',
  },
  description: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'left',
    color: '#555',
    paddingHorizontal: 8,
  },
  card: {
    marginBottom: 20,
    elevation: 2,
    borderRadius: 8,
  },
  appRowContainer: {
    marginBottom: 20,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  appSubheading: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#444',
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputContainer: {
    flex: 1,
    marginHorizontal: 4,
  },
  appInput: {
    backgroundColor: '#fff',
  },
  appErrorText: {
    fontSize: 12,
    paddingLeft: 2,
    minHeight: 18,
  },
  generalErrorText: {
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 16,
    color: 'red',
  },
  noAppsText: {
    textAlign: 'center',
    fontSize: 16,
    paddingVertical: 20,
    color: '#666',
  },
  button: {
    marginTop: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
  },
  checkboxContainer: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignSelf: 'flex-start',
  },
  checkboxLabel: {
    fontSize: 14,
    marginLeft: -8,
  },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appTitle: {
    fontSize: 18,
    flexShrink: 1,
  },
  usageInfo: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  infoText: {
    textAlign: 'center',
    marginVertical: 20,
    fontSize: 16,
    color: '#555',
  },
});

export default TimeSettingScreen; 