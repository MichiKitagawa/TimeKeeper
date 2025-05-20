import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, FlatList } from 'react-native';
import { TextInput, Button, Text, HelperText, Provider as PaperProvider, Card, Title, Appbar, Subheading, Checkbox, Searchbar, List } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { setUserTimeSettings, UserTimeSettings, AppUsageLimits, getUserDocument } from '../services/userService';
import { getNativeInstalledLaunchableApps, InstalledAppInfo } from '../services/nativeUsageStats';
import type { AppStackParamList } from '../navigation/AppNavigator';
import auth from '@react-native-firebase/auth';

interface DisplayAppInfoForSetting extends InstalledAppInfo {
  id: string;
  currentUsageInput: string;
  targetUsageInput: string;
  isSelectedToTrack: boolean;
}

const TimeSettingScreen = () => {
  const navigation = useNavigation<StackNavigationProp<AppStackParamList, 'TimeSettingScreen'>>();
  const currentUser = auth().currentUser;

  const [allInstalledApps, setAllInstalledApps] = useState<DisplayAppInfoForSetting[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingApps, setIsFetchingApps] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appErrors, setAppErrors] = useState<{[key: string]: { initial?: string | null, target?: string | null }}>({});
  const [isInitialSettingDone, setIsInitialSettingDone] = useState(false);

  const filteredApps = allInstalledApps.filter(app => 
    app.appName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fetchAndInitializeApps = useCallback(async () => {
    if (!currentUser) {
      Alert.alert("エラー", "ユーザーがログインしていません。");
      setIsFetchingApps(false);
      return;
    }
    setIsFetchingApps(true);
    setError(null);
    setAppErrors({});

    try {
      const installedApps = await getNativeInstalledLaunchableApps();
      console.log('Installed Apps:', JSON.stringify(installedApps, null, 2));
      const userDoc = await getUserDocument(currentUser.uid);
      const existingInitialLimits = userDoc?.initialDailyUsageLimit?.byApp || {};
      const existingTargetLimits = userDoc?.currentLimit?.byApp || {};
      const existingLockedApps = userDoc?.lockedApps || [];
      setIsInitialSettingDone(userDoc?.timeLimitSet || false);

      const processedAppPackages = new Set<string>();
      let appKeySuffix = 0;

      const initializedApps: DisplayAppInfoForSetting[] = installedApps.reduce((acc, app) => {
        let uniqueId = app.packageName;
        if (processedAppPackages.has(app.packageName)) {
          // パッケージ名が重複している場合、一意なIDを生成
          uniqueId = `${app.packageName}_${appKeySuffix++}`;
          console.warn(`Duplicate packageName found: ${app.packageName}. Assigning unique key: ${uniqueId}`);
        }
        processedAppPackages.add(app.packageName);

        acc.push({
          ...app,
          id: uniqueId, // ここで uniqueId を使用
          currentUsageInput: existingInitialLimits[app.packageName]?.toString() || '',
          targetUsageInput: existingTargetLimits[app.packageName]?.toString() || '',
          isSelectedToTrack: existingLockedApps.includes(app.packageName) || 
                             (!!existingInitialLimits[app.packageName] && !!existingTargetLimits[app.packageName]),
        });
        return acc;
      }, [] as DisplayAppInfoForSetting[]).sort((a, b) => a.appName.localeCompare(b.appName));

      setAllInstalledApps(initializedApps);
      if (initializedApps.length === 0) {
        setError("インストールされているアプリが見つかりません。");
      }
    } catch (e) {
      console.error("Failed to fetch or initialize apps:", e);
      setError("アプリ一覧の取得または初期設定の読み込みに失敗しました。");
      setAllInstalledApps([]);
    } finally {
      setIsFetchingApps(false);
    }
  }, [currentUser]);

  useFocusEffect(
    useCallback(() => {
      fetchAndInitializeApps();
    }, [fetchAndInitializeApps])
  );

  const handleToggleSelectApp = (packageName: string) => {
    setAllInstalledApps(prevApps => 
      prevApps.map(app => 
        app.packageName === packageName 
          ? { ...app, isSelectedToTrack: !app.isSelectedToTrack } 
          : app
      )
    );
  };

  const handleInputChange = (packageName: string, field: 'current' | 'target', text: string) => {
    setAllInstalledApps(prevApps => 
      prevApps.map(app => {
        if (app.packageName === packageName) {
          const updatedApp = { ...app };
          if (field === 'current') updatedApp.currentUsageInput = text;
          if (field === 'target') updatedApp.targetUsageInput = text;
          return updatedApp;
        }
        return app;
      })
    );
    const validationError = validateIndividualTimeLimit(text, true, field === 'target' && allInstalledApps.find(a=>a.packageName === packageName)?.isSelectedToTrack);
    setAppErrors(prev => ({
      ...prev,
      [packageName]: { ...prev[packageName], [field === 'current' ? 'initial' : 'target']: validationError },
    }));
  };

  const validateIndividualTimeLimit = (timeLimit: string, allowZero: boolean = true, isTargetRequired: boolean = false): string | null => {
    if (!timeLimit && isTargetRequired) return '時間を入力してください。';
    if (!timeLimit && !isTargetRequired) return null;
    
    const numericTimeLimit = parseInt(timeLimit, 10);
    if (isNaN(numericTimeLimit)) return '数値を入力してください。';
    if (numericTimeLimit < (allowZero && !isTargetRequired ? 0 : 1) || numericTimeLimit > 1440) {
      return `時間は${(allowZero && !isTargetRequired ? 0 : 1)}分から1440分の間で設定してください。`;
    }
    if (!Number.isInteger(numericTimeLimit)) return '整数で入力してください。';
    return null;
  };
  
  const validateTargetTimeEdit = (newTarget: number, oldTarget?: number): string | null => {
    if (oldTarget !== undefined && newTarget > oldTarget) {
      return '目標時間は以前の値より短縮する必要があります。';
    }
    return null;
  };

  const handleConfirm = async () => {
    if (!currentUser) {
      Alert.alert("エラー", "ユーザー情報が見つかりません。");
      return;
    }
    setIsLoading(true);
    setError(null);
    setAppErrors({});
    let hasError = false;

    const initialDailyUsageLimit: AppUsageLimits = {};
    const targetLimit: AppUsageLimits = {};
    const lockedApps: string[] = [];
    const appNameMap: { [packageName: string]: string } = {};
    const userDoc = await getUserDocument(currentUser.uid);
    const existingTargetLimits = userDoc?.currentLimit?.byApp || {};

    for (const app of allInstalledApps) {
      if (app.isSelectedToTrack) {
        const initialError = validateIndividualTimeLimit(app.currentUsageInput, true, false);
        const targetError = validateIndividualTimeLimit(app.targetUsageInput, false, true);
        let editError: string | null = null;

        const currentTargetNum = parseInt(app.targetUsageInput, 10);
        if (!targetError && !isNaN(currentTargetNum)) {
            const oldTargetNum = existingTargetLimits[app.packageName];
            editError = validateTargetTimeEdit(currentTargetNum, oldTargetNum);
        }

        if (initialError || targetError || editError) {
          hasError = true;
          setAppErrors(prev => ({
            ...prev,
            [app.packageName]: { initial: initialError, target: targetError || editError },
          }));
        } else {
          const initialVal = parseInt(app.currentUsageInput, 10);
          const targetVal = parseInt(app.targetUsageInput, 10);

          if (!isNaN(initialVal)) initialDailyUsageLimit[app.packageName] = initialVal;
          else initialDailyUsageLimit[app.packageName] = 0;
          
          if (!isNaN(targetVal)) targetLimit[app.packageName] = targetVal;
        }

        lockedApps.push(app.packageName);
        appNameMap[app.packageName] = app.appName;
      }
    }

    if (hasError) {
      setIsLoading(false);
      Alert.alert("入力エラー", "入力内容を確認してください。");
      return;
    }
    
    if (Object.keys(targetLimit).length === 0) {
        Alert.alert("設定なし", "少なくとも1つのアプリの目標時間を設定してください。");
        setIsLoading(false);
        return;
    }

    const totalInitial = Object.values(initialDailyUsageLimit).reduce((sum, val) => sum + val, 0);
    const totalTarget = Object.values(targetLimit).reduce((sum, val) => sum + val, 0);

    const settingsToSave: UserTimeSettings = {
      initialDailyUsageLimit: { total: totalInitial, byApp: initialDailyUsageLimit },
      targetLimit: { total: totalTarget, byApp: targetLimit },
      lockedApps: lockedApps,
      appNameMap: appNameMap,
    };

    try {
      await setUserTimeSettings(currentUser.uid, settingsToSave);
      Alert.alert("成功", "時間設定を保存しました。次に支払い画面に進みます。");
      navigation.replace('Deposit'); 
    } catch (e: any) {
      console.error("Failed to save time settings:", e);
      setError(`設定の保存に失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderAppItem = ({ item }: { item: DisplayAppInfoForSetting }) => (
    <Card style={styles.card}>
      <List.Item 
        title={item.appName}
        description={item.packageName}
        left={() => <Checkbox status={item.isSelectedToTrack ? 'checked' : 'unchecked'} onPress={() => handleToggleSelectApp(item.packageName)} />}
      />
      {item.isSelectedToTrack && (
        <Card.Content>
          <TextInput
            label="現在の1日の使用時間 (分)"
            value={item.currentUsageInput}
            onChangeText={(text) => handleInputChange(item.packageName, 'current', text)}
            keyboardType="numeric"
            style={styles.input}
            error={!!appErrors[item.packageName]?.initial}
            editable={!isInitialSettingDone}
          />
          <HelperText type="error" visible={!!appErrors[item.packageName]?.initial}>
            {appErrors[item.packageName]?.initial}
          </HelperText>
          <TextInput
            label="目標の1日の使用時間 (分)"
            value={item.targetUsageInput}
            onChangeText={(text) => handleInputChange(item.packageName, 'target', text)}
            keyboardType="numeric"
            style={styles.input}
            error={!!appErrors[item.packageName]?.target}
          />
          <HelperText type="error" visible={!!appErrors[item.packageName]?.target}>
            {appErrors[item.packageName]?.target}
          </HelperText>
        </Card.Content>
      )}
    </Card>
  );

  if (isFetchingApps) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator animating={true} size="large" />
        <Text style={styles.loadingText}>アプリ情報を読み込んでいます...</Text>
      </View>
    );
  }

  return (
    <PaperProvider>
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.Content title="時間設定" />
        </Appbar.Header>
        <FlatList
          data={filteredApps}
          renderItem={renderAppItem}
          keyExtractor={item => item.id}
          ListHeaderComponent={
            <View>
              <Searchbar
                placeholder="アプリを検索"
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={styles.searchbar}
              />
              {error && <HelperText type="error" visible={!!error} style={styles.generalError}>{error}</HelperText>}
              {filteredApps.length === 0 && !isFetchingApps && !error && (
                <Text style={styles.noResultsText}>
                  {searchQuery ? `"${searchQuery}"に一致するアプリは見つかりませんでした。` : "表示できるアプリがありません。"}
                </Text>
              )}
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerControls}>
              <Button 
                mode="contained" 
                onPress={handleConfirm} 
                loading={isLoading}
                disabled={isLoading || isFetchingApps || Object.values(appErrors).some(errs => errs.initial || errs.target)}
                style={styles.button}
              >
                設定を保存して支払いへ
              </Button>
            </View>
          }
          contentContainerStyle={styles.listContentContainer}
        />
      </View>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
  },
  searchbar: {
    margin: 10,
  },
  listContentContainer: {
    paddingBottom: 20,
  },
  card: {
    marginHorizontal: 10,
    marginBottom: 10,
    elevation: 2,
  },
  input: {
    marginBottom: 8,
  },
  button: {
    margin: 10,
    marginTop: 20,
  },
  footerControls: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  generalError: {
    marginHorizontal: 15,
    fontSize: 14,
  },
  noResultsText: {
    textAlign: 'center',
    marginVertical: 20,
    fontSize: 16,
    color: '#666',
  }
});

export default TimeSettingScreen; 