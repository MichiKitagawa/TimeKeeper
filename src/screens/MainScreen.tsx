import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native'; // AppStateは MainScreen では直接使わない
import { Text, ProgressBar, Provider as PaperProvider, Card, Title, Paragraph, ActivityIndicator } from 'react-native-paper';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { useAuth } from '../navigation/AppNavigator';
import { useNavigation, StackActions } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AppStackParamList } from '../navigation/AppNavigator';

// 今日の日付の0時0分0秒(UTC)を取得するヘルパー (usageTrackingServiceから拝借)
const getTodayUtcTimestamp = (): FirebaseFirestoreTypes.Timestamp => {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return firestore.Timestamp.fromDate(now);
};

interface ChallengeData {
  currentDailyLimitMinutes: number;
  // 他にも必要なフィールドがあれば追加
}

interface UsageLogData {
  usedMinutes: number;
  dailyLimitReached: boolean;
  // 他にも必要なフィールドがあれば追加
}

// NavigationPropの型を定義
type MainScreenNavigationProp = StackNavigationProp<
  AppStackParamList,
  'Home'
>;

const MainScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation<MainScreenNavigationProp>();

  const [currentChallengeId, setCurrentChallengeId] = useState<string | null>(null);
  const [challengeData, setChallengeData] = useState<ChallengeData | null>(null);
  const [usageLogData, setUsageLogData] = useState<UsageLogData | null>(null);
  
  // ローディング状態を3つのデータソースに対して管理
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoadingChallenge, setIsLoadingChallenge] = useState(true);
  const [isLoadingUsageLog, setIsLoadingUsageLog] = useState(true);

  const [error, setError] = useState<string | null>(null);

  // 1. ユーザー情報を購読し、challengeId を取得
  useEffect(() => {
    if (!user) {
      setIsLoadingUser(false);
      setCurrentChallengeId(null);
      return;
    }
    setIsLoadingUser(true);
    const userDocRef = firestore().collection('users').doc(user.uid);
    const unsubscribe = userDocRef.onSnapshot(
      (doc) => {
        if (doc.exists) {
          const data = doc.data();
          setCurrentChallengeId(data?.challengeId || null);
          if (!data?.challengeId) {
            setError('進行中のチャレンジがありません。時間設定を行ってください。');
          } else {
            setError(null); // ChallengeIdが見つかればエラー解除
          }
        } else {
          setError('ユーザーデータが見つかりません。');
          setCurrentChallengeId(null);
        }
        setIsLoadingUser(false);
      },
      (err) => {
        console.error("Error fetching user data: ", err);
        setError('ユーザー情報の取得に失敗しました。');
        setIsLoadingUser(false);
        setCurrentChallengeId(null);
      }
    );
    return unsubscribe; // クリーンアップ関数を返す
  }, [user]);

  // 2. currentChallengeId に基づいてチャレンジ情報を購読
  useEffect(() => {
    if (!currentChallengeId) {
      setChallengeData(null);
      setIsLoadingChallenge(false); // ChallengeIdがなければチャレンジ情報のロードは完了(失敗扱い)
      return;
    }
    setIsLoadingChallenge(true);
    const challengeDocRef = firestore().collection('challenges').doc(currentChallengeId);
    const unsubscribe = challengeDocRef.onSnapshot(
      (doc) => {
        if (doc.exists) {
          setChallengeData(doc.data() as ChallengeData);
          // setError(null); // 他のエラーを上書きしないように注意
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
    return unsubscribe; // クリーンアップ関数を返す
  }, [currentChallengeId]);

  // 3. usageLogsコレクションのリスナー
  useEffect(() => {
    if (!user) {
      setUsageLogData(null);
      setIsLoadingUsageLog(false);
      return;
    }
    setIsLoadingUsageLog(true);
    const todayTimestamp = getTodayUtcTimestamp();
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
          setUsageLogData({ usedMinutes: 0, dailyLimitReached: false });
        }
        // setError(null); // 他のエラーを上書きしないように注意
        setIsLoadingUsageLog(false);
      },
      (err) => {
        console.error("Error fetching usage log: ", err);
        setError('利用履歴の取得に失敗しました。');
        setUsageLogData({ usedMinutes: 0, dailyLimitReached: false });
        setIsLoadingUsageLog(false);
      }
    );
    return unsubscribe; // クリーンアップ関数を返す
  }, [user]);

  // 4. ロック条件の判定と dailyLimitReached の更新、画面遷移
  useEffect(() => {
    if (user && challengeData && usageLogData) {
      const dailyLimit = challengeData.currentDailyLimitMinutes || 0;
      const used = usageLogData.usedMinutes || 0;

      // dailyLimit が 0 より大きく、使用時間が上限を超え、まだロックされていない場合
      if (used >= dailyLimit && dailyLimit > 0 && !usageLogData.dailyLimitReached) {
        console.log('Lock condition met! Navigating to LockScreen.');
        const todayTimestamp = getTodayUtcTimestamp();
        const usageLogDocQuery = firestore()
          .collection('usageLogs')
          .where('userId', '==', user.uid)
          .where('date', '==', todayTimestamp)
          .limit(1);
        
        usageLogDocQuery.get().then(snapshot => {
          if (!snapshot.empty) {
            const docRef = snapshot.docs[0].ref;
            docRef.update({ dailyLimitReached: true })
              .then(() => {
                navigation.dispatch(StackActions.replace('LockScreen')); // LockScreenへ遷移
              })
              .catch(err => console.error("Failed to update dailyLimitReached: ", err));
          } else {
            // usageLogドキュメントが存在しない場合 (理論上はusageLogData取得時に作成されるはずだが念のため)
            // 必要であればここで作成し、dailyLimitReachedをtrueにしてから遷移
            console.warn("UsageLog document not found when trying to set dailyLimitReached. Navigating anyway.");
            navigation.dispatch(StackActions.replace('LockScreen'));
          }
        }).catch(err => {
            console.error("Failed to query for usageLog to update dailyLimitReached: ", err);
            // クエリ失敗時もロック画面へフォールバックする可能性があるが、エラーをログに出力して通知
            navigation.dispatch(StackActions.replace('LockScreen'));
        });
      } else if (usageLogData.dailyLimitReached) {
        // 既に dailyLimitReached が true の場合は、直接LockScreenへ (例: アプリ再起動時など)
        console.log('Daily limit already reached, navigating to LockScreen if not already there.');
        // 現在のルートがLockScreenでないことを確認してから遷移 (無限ループ防止)
        const currentRoute = navigation.getState()?.routes[navigation.getState().index]?.name;
        if (currentRoute !== 'LockScreen') {
            navigation.dispatch(StackActions.replace('LockScreen'));
        }
      }
    }
  }, [user, challengeData, usageLogData, navigation]);

  const isLoading = isLoadingUser || isLoadingChallenge || isLoadingUsageLog;

  if (isLoading) {
    return <PaperProvider><View style={styles.centered}><ActivityIndicator animating={true} size="large" /></View></PaperProvider>;
  }

  // エラーがあり、かつチャレンジデータか利用ログのどちらかが無い場合にエラー表示
  if (error && (!challengeData || !usageLogData) && currentChallengeId) { 
    // ただし、challengeIdがないことによるエラー(setError('進行中のチャレンジがありません...')等)の場合は、challengeData が null でも正常系として扱う場面もあるので、エラー内容に応じて制御が望ましい
    // ここでは、主要なデータ取得に失敗した場合にエラーを表示
    if (error.includes('取得に失敗しました') || error.includes('見つかりません')) {
        return <PaperProvider><View style={styles.centered}><Text>{error}</Text></View></PaperProvider>;
    }
  }

  const dailyLimitMinutes = challengeData?.currentDailyLimitMinutes ?? 0;
  const usedMinutes = usageLogData?.usedMinutes ?? 0;
  const remainingTime = Math.max(0, dailyLimitMinutes - usedMinutes);
  const progress = dailyLimitMinutes > 0 ? Math.min(1, usedMinutes / dailyLimitMinutes) : (usedMinutes > 0 ? 1 : 0);

  return (
    <PaperProvider>
      <View style={styles.container}>
        {/* ユーザーに分かりやすいエラー表示 (challengeIdなしエラーなど) */} 
        {error && (error.includes('進行中のチャレンジがありません') || error.includes('ユーザーデータが見つかりません')) && 
            <Text style={styles.errorText}>{error}</Text>}

        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.title}>今日の残り時間</Title>
            <Text style={styles.timeText}>
              {Math.floor(remainingTime / 60)} 時間 {remainingTime % 60} 分
            </Text>
            <Paragraph>今日の目標: {dailyLimitMinutes > 0 ? `${dailyLimitMinutes}分` : '未設定'}</Paragraph>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Title>今日の使用状況</Title>
            <ProgressBar progress={progress} style={styles.progressBar} color={progress >= 1 ? 'red' : '#6200ee'} />
            <Text style={styles.progressText}>
              {usedMinutes}分 / {dailyLimitMinutes > 0 ? `${dailyLimitMinutes}分` : '--分'} 使用済み
            </Text>
          </Card.Content>
        </Card>
      </View>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
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
    }
});

export default MainScreen; 