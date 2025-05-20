import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, NativeEventEmitter, NativeModules, Alert, FlatList } from 'react-native';
import { Text, ProgressBar, Provider as PaperProvider, Card, Title, Paragraph, ActivityIndicator, Subheading, DataTable, Button } from 'react-native-paper';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { useAuth } from '../navigation/AppNavigator';
import { useNavigation, StackActions, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AppStackParamList } from '../navigation/AppNavigator';
import { getTodayUtcTimestamp, AppUsageStatsData } from '../services/usageTrackingService';
import { getUserDocument } from '../services/userService';

// users ドキュメントの型 (MainScreenで必要な部分)
interface UserDataForMain {
  currentDailyUsageLimit?: { 
    total: number | null; 
    byApp?: { [key: string]: number }; 
  };
  currentLimit?: { // TimeSettingScreenで設定した目標時間 (currentDailyUsageLimit と同じ想定)
    total: number | null;
    byApp?: { [key: string]: number };
  };
  lockedApps?: string[]; // 追跡・ロック対象として選択されたアプリのパッケージ名リスト
  appNameMap?: { [key: string]: string }; 
}

interface UsageLogData {
  usedMinutes?: number; // 全体の合計利用時間 (オプション)
  dailyLimitReached?: boolean; // (オプション)
  usedMinutesByPackage?: { [key: string]: number }; 
}

interface DisplayAppUsageInfo {
  packageName: string;
  appName: string;
  allowedMinutes: number; // 今日の使用許可時間 (currentDailyUsageLimit.byApp)
  usedMinutes: number;    // 今日の使用時間 (usedMinutesByPackage)
  remainingMinutes: number;
  progress: number;       // 使用率 (0-1)
  isLocked: boolean;      // このアプリがロックされているか
}

type MainScreenNavigationProp = StackNavigationProp<AppStackParamList, 'Home'>;

const MainScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation<MainScreenNavigationProp>();

  const [userData, setUserData] = useState<UserDataForMain | null>(null);
  const [usageLogData, setUsageLogData] = useState<UsageLogData | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [displayAppUsages, setDisplayAppUsages] = useState<DisplayAppUsageInfo[]>([]);

  const fetchDataAndProcess = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const userDoc = await getUserDocument(user.uid);
      if (!userDoc) {
        setError('ユーザーデータが見つかりません。時間設定画面に遷移します。');
        navigation.replace('TimeSettingScreen');
        setIsLoading(false);
        return;
      }
      setUserData(userDoc as UserDataForMain);

      if (!userDoc.timeLimitSet || !userDoc.paymentCompleted) {
        setError('初期設定が完了していません。適切な画面に遷移します。');
        if (!userDoc.timeLimitSet) navigation.replace('TimeSettingScreen');
        else if (!userDoc.paymentCompleted) navigation.replace('Deposit');
        setIsLoading(false);
        return;
      }
      
      const todayTimestamp = getTodayUtcTimestamp();
      let currentUsageLog: UsageLogData | null = null;
      if (todayTimestamp) {
        const usageLogQuery = firestore()
          .collection('usageLogs')
          .where('userId', '==', user.uid)
          .where('date', '==', todayTimestamp)
          .limit(1);
        const usageLogSnapshot = await usageLogQuery.get();
        if (!usageLogSnapshot.empty) {
          currentUsageLog = usageLogSnapshot.docs[0].data() as UsageLogData;
        }
      }
      setUsageLogData(currentUsageLog);

      const appNameMap = userDoc.appNameMap || {};
      const dailyLimits = userDoc.currentDailyUsageLimit?.byApp || {};
      const usedByPackage = currentUsageLog?.usedMinutesByPackage || {};
      const trackedApps = userDoc.lockedApps || [];

      const newDisplayUsages: DisplayAppUsageInfo[] = trackedApps.map(pkg => {
        const appName = appNameMap[pkg] || pkg;
        const allowed = dailyLimits[pkg] !== undefined ? dailyLimits[pkg] : Infinity;
        const used = usedByPackage[pkg] || 0;
        const remaining = Math.max(0, allowed - used);
        const progress = allowed > 0 ? Math.min(1, used / allowed) : (used > 0 ? 1 : 0);
        const isLocked = used >= allowed;
        return { packageName: pkg, appName, allowedMinutes: allowed, usedMinutes: used, remainingMinutes: remaining, progress, isLocked };
      });

      setDisplayAppUsages(newDisplayUsages.sort((a,b) => a.appName.localeCompare(b.appName)));

    } catch (e: any) {
      console.error("MainScreen fetchData Error: ", e);
      setError(`データの取得に失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  }, [user, navigation]);

  useFocusEffect(
    useCallback(() => {
      fetchDataAndProcess();
      // クリーンアップが必要な場合はここで関数を返す
    }, [fetchDataAndProcess])
  );

  useEffect(() => {
    const eventEmitter = new NativeEventEmitter(NativeModules.UsageStatsModule);
    const eventListener = eventEmitter.addListener('onUnlockRequested', (event: {packageName: string}) => {
      console.log('Unlock requested for package:', event.packageName);
      if (event.packageName) {
        const appToUnlock = displayAppUsages.find(app => app.packageName === event.packageName);
        if (appToUnlock) {
          navigation.navigate('UnlockProcessingScreen', { 
            packageName: event.packageName,
            limitMinutes: appToUnlock.allowedMinutes
          });
        } else {
          console.warn(`Unlock requested for ${event.packageName}, but app details not found in displayAppUsages.`);
          Alert.alert('エラー', 'アンロック対象のアプリ情報が見つかりません。');
        }
      } else {
        console.warn('Unlock requested but packageName is missing.');
        Alert.alert('エラー', 'アンロック対象のアプリ情報がありません。');
      }
    });
    return () => {
      eventListener.remove();
    };
  }, [navigation, displayAppUsages]);

  if (isLoading) {
    return (
      <PaperProvider>
        <View style={styles.centeredContainer}>
          <ActivityIndicator animating={true} size="large" />
          <Text style={{ marginTop: 10 }}>情報を読み込んでいます...</Text>
        </View>
      </PaperProvider>
    );
  }

  if (error) {
    return (
      <PaperProvider>
        <View style={styles.centeredContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button onPress={() => navigation.replace('TimeSettingScreen')}>時間設定へ</Button>
        </View>
      </PaperProvider>
    );
  }

  if (displayAppUsages.length === 0) {
    return (
      <PaperProvider>
        <View style={styles.centeredContainer}>
          <Text>監視対象のアプリが設定されていません。</Text>
          <Button onPress={() => navigation.navigate('TimeSettingScreen')}>時間設定を行う</Button>
        </View>
      </PaperProvider>
    );
  }

  const renderAppUsageItem = ({ item }: { item: DisplayAppUsageInfo }) => (
    <Card style={styles.card}>
      <Card.Content>
        <Title>{item.appName} {item.isLocked ? "(ロック中)" : ""}</Title>
        <Paragraph>
          今日の使用時間: {item.usedMinutes}分 / {item.allowedMinutes === Infinity ? '制限なし' : `${item.allowedMinutes}分`}
        </Paragraph>
        <Paragraph>
          残り利用可能時間: {item.allowedMinutes === Infinity ? '制限なし' : `${item.remainingMinutes}分`}
        </Paragraph>
        {item.allowedMinutes !== Infinity && <ProgressBar progress={item.progress} color={item.progress > 0.8 ? 'red' : 'green'} style={{ marginVertical: 8 }} />}
        {item.isLocked && 
          <Button 
            mode="outlined" 
            onPress={() => navigation.navigate('UnlockProcessingScreen', { 
                packageName: item.packageName,
                limitMinutes: item.allowedMinutes 
            })}
            style={{marginTop: 10}}
          >
            アンロックする
          </Button>
        }
      </Card.Content>
    </Card>
  );

  return (
    <PaperProvider>
      <ScrollView contentContainerStyle={styles.container}>
        <Subheading style={styles.header}>監視対象アプリの利用状況</Subheading>
        {displayAppUsages.length > 0 ? (
          <FlatList
            data={displayAppUsages}
            renderItem={renderAppUsageItem}
            keyExtractor={item => item.packageName}
          />
        ) : (
          <Text style={styles.infoText}>時間設定画面で監視するアプリと利用時間を設定してください。</Text>
        )}

        <Button 
          mode="contained"
          onPress={() => navigation.navigate('TimeSettingScreen')}
          style={styles.button}
        >
          時間設定を編集する
        </Button>
      </ScrollView>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 16,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
  },
  infoText: {
    textAlign: 'center',
    marginVertical: 20,
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 16,
  },
  button: {
    marginVertical: 20,
  }
});

export default MainScreen; 