import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, NativeEventEmitter, NativeModules, Alert } from 'react-native'; // ScrollView, NativeEventEmitter, NativeModules, Alert を追加
import { Text, ProgressBar, Provider as PaperProvider, Card, Title, Paragraph, ActivityIndicator, Subheading, DataTable } from 'react-native-paper'; // Subheading, DataTable を追加
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { useAuth } from '../navigation/AppNavigator';
import { useNavigation, StackActions } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AppStackParamList } from '../navigation/AppNavigator';
import { getTodayUtcTimestamp } from '../services/usageTrackingService'; // インポート

// users ドキュメントの型 (MainScreenで必要な部分)
interface UserDataForMain {
  currentChallengeId?: string | null;
  currentDailyUsageLimit?: { // これはアプリごとの目標時間を保持するフィールドとして活用
    total: number | null; // 全体の目標合計時間 (これは表示しないかも)
    byApp?: { [key: string]: number }; // 各アプリの目標時間
  };
  lockedApps?: string[]; // ロック対象として選択されたアプリのパッケージ名リスト
  appNameMap?: { [key: string]: string }; // パッケージ名とアプリ名をマッピングするため追加
}

interface ChallengeData {
  id: string;
  currentDailyLimitMinutes: number; // これは users.currentDailyUsageLimit.total と同期されるが、表示やロジックの整合性のため残す
  targetLimitMinutes?: number; // チャレンジの最終目標合計時間
  remainingDays?: number; 
  targetDays?: number; 
  status?: string; 
}

interface UsageLogData {
  usedMinutes: number; // 全体の合計利用時間 (これは表示しないかも)
  dailyLimitReached: boolean; // 全体のリミット到達 (これは使わないかも)
  usedMinutesByPackage?: { [key: string]: number }; // 各アプリの利用時間
}

// MainScreen のナビゲーションプロパティの型定義
// (AppStackParamList から MainScreen に渡される可能性のあるルートパラメータを定義)
type MainScreenNavigationProp = StackNavigationProp<AppStackParamList, 'Home'>;

const MainScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation<MainScreenNavigationProp>();

  const [userData, setUserData] = useState<UserDataForMain | null>(null); // usersドキュメントの主要データを保持
  const [challengeData, setChallengeData] = useState<ChallengeData | null>(null);
  const [usageLogData, setUsageLogData] = useState<UsageLogData | null>(null);
  
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoadingChallenge, setIsLoadingChallenge] = useState(true);
  const [isLoadingUsageLog, setIsLoadingUsageLog] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [lockedAppsDetailedInfo, setLockedAppsDetailedInfo] = useState<Array<{packageName: string, appName: string, targetMinutes: number, usedMinutes: number, remainingMinutes: number, progress: number}>>([]);

  // アンロック要求イベントのリスナー設定
  useEffect(() => {
    const eventEmitter = new NativeEventEmitter(NativeModules.UsageStatsModule);
    const eventListener = eventEmitter.addListener('onUnlockRequested', (event) => {
      console.log('Unlock requested for package:', event.packageName);
      if (event.packageName) {
        const appToUnlock = lockedAppsDetailedInfo.find(app => app.packageName === event.packageName);
        if (appToUnlock) {
          navigation.navigate('UnlockProcessingScreen', { 
            packageName: event.packageName,
            limitMinutes: appToUnlock.targetMinutes // targetMinutes (目標時間) を渡す
          });
        } else {
          console.warn(`Unlock requested for ${event.packageName}, but app details not found in lockedAppsDetailedInfo.`);
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
  }, [navigation]); // navigation を依存配列に追加

  // 1. ユーザー情報を購読し、userData (currentChallengeId, currentDailyUsageLimit, appNameMapなど) を取得
  useEffect(() => {
    if (!user) {
      setIsLoadingUser(false);
      setUserData(null);
      return;
    }
    setIsLoadingUser(true);
    const userDocRef = firestore().collection('users').doc(user.uid);
    const unsubscribe = userDocRef.onSnapshot(
      (doc) => {
        if (doc.exists()) {
          const data = doc.data() as UserDataForMain; // 型アサーション
          setUserData(data);
          if (!data?.currentChallengeId) {
            setError('進行中のチャレンジがありません。時間設定を行ってください。');
          } else {
            setError(null); 
          }
        } else {
          setError('ユーザーデータが見つかりません。');
          setUserData(null);
        }
        setIsLoadingUser(false);
      },
      (err) => {
        console.error("Error fetching user data: ", err);
        setError('ユーザー情報の取得に失敗しました。');
        setIsLoadingUser(false);
        setUserData(null);
      }
    );
    return unsubscribe; 
  }, [user]);

  // 2. userData.currentChallengeId に基づいてチャレンジ情報を購読
  useEffect(() => {
    if (!userData?.currentChallengeId) {
      setChallengeData(null);
      setIsLoadingChallenge(false); 
      return;
    }
    setIsLoadingChallenge(true);
    const challengeDocRef = firestore().collection('challenges').doc(userData.currentChallengeId);
    const unsubscribe = challengeDocRef.onSnapshot(
      (doc) => {
        if (doc.exists()) {
          const data = { id: doc.id, ...doc.data() } as ChallengeData;
          setChallengeData(data);

          // CompletionScreenへの遷移ロジックはひとまず維持 (全体の目標達成に基づく)
          // アプリごとの目標達成による完了は別途検討
          if (data && data.status === 'active') { 
            const currentTotalUsageLimit = userData?.currentDailyUsageLimit?.total; // これはチャレンジの現在の進行度を示すものとして残す
            const targetTotalMinutes = data.targetLimitMinutes; // チャレンジの最終目標合計

            if (typeof currentTotalUsageLimit === 'number' && 
                typeof targetTotalMinutes === 'number' && 
                currentTotalUsageLimit <= targetTotalMinutes) {
              console.log('Challenge completed based on overall usage limit! Navigating to CompletionScreen.');
              // navigation.dispatch(StackActions.replace('CompletionScreen', { challengeId: data.id })); // CompletionScreen は削除された
              // TODO: 新しい完了フローを検討 (例: 設定画面に戻って新しい目標を設定する、など)
              Alert.alert("チャレンジ達成！", "目標利用時間を達成しました。おめでとうございます！"); 
              // ここでは一旦アラートのみとし、ナビゲーションは別途設計
              return; 
            }
            const isCompletedByDays = data.remainingDays != null && data.remainingDays <= 0;
            if (isCompletedByDays) {
              console.log('Challenge completed by days! Navigating to CompletionScreen.');
              // navigation.dispatch(StackActions.replace('CompletionScreen', { challengeId: data.id })); // CompletionScreen は削除された
              Alert.alert("チャレンジ期間終了！", "目標期間が終了しました。");
              return; 
            }
          }
        } else {
          setError((prevError) => prevError || '有効なチャレンジデータが見つかりません。');
          setChallengeData(null);
        }
        setIsLoadingChallenge(false);
      },
      (err) => {
        console.error("Error fetching challenge data: ", err);
        setError('チャレンジ情報の取得に失敗しました。');
        setChallengeData(null);
        setIsLoadingChallenge(false);
      }
    );
    return unsubscribe; 
  }, [userData, navigation]); // userData を依存配列に追加

  // 3. 今日の利用ログを購読
  useEffect(() => {
    if (!user) {
      setUsageLogData(null);
      setIsLoadingUsageLog(false);
      return;
    }
    setIsLoadingUsageLog(true);
    const todayTimestamp = getTodayUtcTimestamp();
    if (!todayTimestamp) {
      console.error("Failed to get todayTimestamp for usage log subscription");
      setError('日付の取得に失敗し、利用ログを購読できませんでした。');
      setIsLoadingUsageLog(false);
      return;
    }
    const usageLogQuery = firestore()
      .collection('usageLogs')
      .where('userId', '==', user.uid)
      .where('date', '==', todayTimestamp)
      .limit(1);

    const unsubscribe = usageLogQuery.onSnapshot(
      (querySnapshot) => {
        if (!querySnapshot.empty) {
          const doc = querySnapshot.docs[0];
          setUsageLogData(doc.data() as UsageLogData);
        } else {
          // 今日のログがまだなければ、usedMinutes: 0 として扱うか、nullのままにするか。
          // ここではnullのままにし、表示側で対応
          setUsageLogData(null); 
        }
        setIsLoadingUsageLog(false);
      },
      (err) => {
        console.error("Error fetching usage log: ", err);
        setError('利用ログの取得に失敗しました。');
        setUsageLogData(null);
        setIsLoadingUsageLog(false);
      }
    );
    return unsubscribe;
  }, [user]);

  // 4. ロック条件の判定と画面遷移 -> コメントアウトまたは削除済み
  useEffect(() => {
    console.log("[MainScreen] Overall lock condition check is now handled by ForegroundService.");
  }, [user, userData, usageLogData, navigation]);

  // 5. 表示用データの整形 (lockedAppsDetailedInfo の生成)
  useEffect(() => {
    if (userData && userData.lockedApps && userData.currentDailyUsageLimit?.byApp && usageLogData?.usedMinutesByPackage) {
      const appNameMap = userData.appNameMap || {};
      const limitsByApp = userData.currentDailyUsageLimit.byApp;
      const usageByPackage = usageLogData.usedMinutesByPackage;

      const detailedInfo = userData.lockedApps.map(pkg => {
        const target = limitsByApp[pkg] ?? 0;
        const used = usageByPackage[pkg] ?? 0;
        const remaining = Math.max(0, target - used);
        const progressVal = target > 0 ? Math.min(1, used / target) : (used > 0 ? 1 : 0);
        return {
          packageName: pkg,
          appName: appNameMap[pkg] || pkg,
          targetMinutes: target,
          usedMinutes: used,
          remainingMinutes: remaining,
          progress: progressVal,
        };
      }).sort((a,b) => a.appName.localeCompare(b.appName)); // アプリ名でソート
      setLockedAppsDetailedInfo(detailedInfo);
    } else {
      setLockedAppsDetailedInfo([]);
    }
  }, [userData, usageLogData]);

  const isLoading = isLoadingUser || isLoadingChallenge || isLoadingUsageLog;

  if (isLoading) {
    return (
      <PaperProvider>
        <View style={styles.centered}><ActivityIndicator testID="loading-indicator" animating={true} size="large" /></View>
      </PaperProvider>
    );
  }

  if (error && (!userData || !challengeData) && userData?.currentChallengeId) { 
    if (error.includes('取得に失敗しました') || error.includes('見つかりません')) {
        return <PaperProvider><View style={styles.centered}><Text>{error}</Text></View></PaperProvider>;
    }
  }

  // チャレンジ情報（目標日までの残りなど）の表示は維持しても良い
  const challengeDaysRemaining = challengeData?.remainingDays ?? 'N/A';
  const challengeTargetDays = challengeData?.targetDays ?? 'N/A';

  return (
    <PaperProvider>
      <ScrollView style={styles.container}> {/* ScrollView で全体をラップ */}
        {typeof error === 'string' && (error.includes('進行中のチャレンジがありません') || error.includes('ユーザーデータが見つかりません')) &&
            <Text style={styles.errorText}>{error}</Text>}

        <Card style={styles.card}>
          <Card.Content>
            <Title>今日のチャレンジ</Title>
            {challengeData ? (
              <View>
                <Paragraph>目標達成までの残り日数: {challengeDaysRemaining} / {challengeTargetDays} 日</Paragraph>
                {/* <Paragraph>現在の目標合計時間: {userData?.currentDailyUsageLimit?.total ?? 'N/A'} 分</Paragraph> */}
                {/* <Paragraph>最終目標合計時間: {challengeData.targetLimitMinutes ?? 'N/A'} 分</Paragraph> */}
              </View>
            ) : (
              <Paragraph>{userData?.currentChallengeId ? 'チャレンジ情報を読み込み中...' : 'チャレンジが設定されていません。'}</Paragraph>
            )}
          </Card.Content>
        </Card>

        <Subheading style={styles.sectionTitle}>監視対象アプリの利用状況</Subheading>
        {lockedAppsDetailedInfo.length > 0 ? (
          lockedAppsDetailedInfo.map(appInfo => (
            <Card key={appInfo.packageName} style={styles.appCard}>
              <Card.Content>
                <Title style={styles.appTitle}>{appInfo.appName}</Title>
                <View style={styles.appUsageRow}>
                  <Text>目標: {appInfo.targetMinutes}分</Text>
                  <Text>利用: {appInfo.usedMinutes}分</Text>
                </View>
                <ProgressBar progress={appInfo.progress} color={appInfo.progress >= 1 ? 'red' : 'green'} style={styles.progressBar} />
                <Text style={styles.remainingText}>残り: {appInfo.remainingMinutes}分</Text>
                {appInfo.usedMinutes >= appInfo.targetMinutes && appInfo.targetMinutes > 0 && (
                    <Text style={styles.limitReachedText}>利用上限に達しました</Text>
                )}
                 {appInfo.targetMinutes === 0 && appInfo.usedMinutes > 0 && (
                    <Text style={styles.limitReachedText}>本日は利用できません</Text>
                )}
              </Card.Content>
            </Card>
          ))
        ) : (
          <Card style={styles.card}><Card.Content><Paragraph>監視対象として設定されているアプリはありません。</Paragraph></Card.Content></Card>
        )}
      </ScrollView>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // padding: 16, // ScrollView直下ではなく、内部要素でpaddingを調整する方が良い場合もある
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    marginBottom: 16,
    marginHorizontal: 16, // ScrollViewの場合、左右マージンも考慮
    elevation: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#6200ee',
  },
  progressBar: {
    height: 20,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  progressText: {
    textAlign: 'right',
    fontSize: 12,
    color: 'gray',
  },
  errorText: {
      color: 'red',
      textAlign: 'center',
      marginBottom: 10,
      paddingHorizontal: 10,
    },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    marginLeft: 15,
  },
  appCard: {
    marginHorizontal: 15,
    marginBottom: 10,
    elevation: 2,
  },
  appTitle: {
    fontSize: 18,
    marginBottom: 5,
  },
  appUsageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  remainingText: {
    textAlign: 'right',
    fontStyle: 'italic',
  },
  limitReachedText: {
    color: 'red',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 5,
  },
});

export default MainScreen; 