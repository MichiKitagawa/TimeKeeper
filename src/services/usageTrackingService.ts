import { AppState, AppStateStatus } from 'react-native';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

// グローバルなタイマーIDとカウンター
let foregroundTimer: NodeJS.Timeout | null = null;
let accumulatedSecondsInForeground = 0; // フォアグラウンドでの累積秒数
const SAVE_INTERVAL_SECONDS = 60; // 60秒（1分）ごとに保存

// 今日の日付の0時0分0秒(UTC)を取得するヘルパー
export const getTodayUtcTimestamp = (): FirebaseFirestoreTypes.Timestamp | null => {
  try {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    if (isNaN(now.getTime())) {
        console.error('UsageTracking: getTodayUtcTimestamp - Date became invalid.');
        return null;
    }
    return firestore.Timestamp.fromDate(now);
  } catch (error) {
    console.error('UsageTracking: Error in getTodayUtcTimestamp:', error);
    return null;
  }
};

// usageLogドキュメントID（仮。実際にはクエリで特定）
// const getUsageLogDocId = (userId: string): string => {
//   const today = new Date();
//   const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
//   return `${userId}_${dateStr}`;
// };

// Firestoreに今日の利用時間を保存/更新
export const saveUsageTimeToFirestore = async () => {
  const currentUser = auth().currentUser;
  if (!currentUser) { // ユーザーがいない場合は何もしない
    // console.log('UsageTracking: No user, skipping save.');
    return;
  }
  
  if (accumulatedSecondsInForeground < 1 && foregroundTimer === null) {
    // タイマーが停止しており、かつ蓄積時間もない場合は、バックグラウンド移行時の重複呼び出しなどをスキップ
    // console.log('UsageTracking: Timer stopped and no accumulation, skipping save.');
    return;
  }

  // SAVE_INTERVAL_SECONDS に満たない場合でも、バックグラウンド移行時は保存を試みるため、ここの条件は調整
  // if (accumulatedSecondsInForeground < SAVE_INTERVAL_SECONDS && foregroundTimer !== null) {
  //   console.log(`UsageTracking: Not enough time to save yet, accumulated: ${accumulatedSecondsInForeground}s`);
  //   return;
  // }

  const userId = currentUser.uid;
  const todayTimestamp = getTodayUtcTimestamp();

  if (!todayTimestamp) {
    console.error('UsageTracking: Failed to get todayTimestamp. Aborting save.');
    accumulatedSecondsInForeground = 0; // エラー時は蓄積時間をクリア
    return;
  }

  const minutesToSave = Math.floor(accumulatedSecondsInForeground / 60);

  if (minutesToSave === 0) {
    // console.log('UsageTracking: No full minutes to save.');
    // 端数は保持されるので、ここでは何もしないか、ログレベルを下げる
    return;
  }

  console.log(`UsageTracking: Attempting to save ${minutesToSave} minute(s) for user ${userId}. Accumulated: ${accumulatedSecondsInForeground}s`);

  const usageLogsRef = firestore().collection('usageLogs');

  try {
    const querySnapshot = await usageLogsRef
      .where('userId', '==', userId)
      .where('date', '==', todayTimestamp)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      await usageLogsRef.add({
        userId: userId,
        date: todayTimestamp,
        usedMinutes: minutesToSave,
        dailyLimitReached: false,
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    } else {
      const doc = querySnapshot.docs[0];
      const currentUsedMinutes = doc.data().usedMinutes || 0;
      await doc.ref.update({
        usedMinutes: currentUsedMinutes + minutesToSave,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    }
    accumulatedSecondsInForeground = accumulatedSecondsInForeground % 60;
    console.log(`UsageTracking: Successfully saved ${minutesToSave} minute(s). Remaining seconds: ${accumulatedSecondsInForeground}`);
  } catch (error) {
    console.error('UsageTracking: Error saving usage time to Firestore:', error);
    accumulatedSecondsInForeground = 0; // Firestore保存エラー時は蓄積時間をクリアして無限ループを防ぐ
  }
};

// --- テスト用エクスポート ---
export const _getAccumulatedSecondsInForeground = () => accumulatedSecondsInForeground;
export const _setAccumulatedSecondsInForeground = (seconds: number) => {
  accumulatedSecondsInForeground = seconds;
};
// --- ここまでテスト用エクスポート ---

// AppStateの変更を監視
const handleAppStateChange = (nextAppState: AppStateStatus) => {
  // console.log(`UsageTracking: AppState changed to ${nextAppState}.`);
  if (nextAppState === 'active') {
    // console.log('UsageTracking: App has come to the foreground!');
    if (!foregroundTimer) {
      // console.log(`UsageTracking: Starting new foreground timer. accumulatedSeconds: ${accumulatedSecondsInForeground}`);
      foregroundTimer = setInterval(() => {
        accumulatedSecondsInForeground++;
        // 毎秒のログは削除
        if (accumulatedSecondsInForeground >= SAVE_INTERVAL_SECONDS) {
          saveUsageTimeToFirestore();
        }
      }, 1000);
    } else {
      // console.log('UsageTracking: Foreground timer already exists.');
    }
  } else { // inactive or background
    // console.log('UsageTracking: App has gone to the background or inactive.');
    if (foregroundTimer) {
      // console.log(`UsageTracking: Clearing foreground timer. accumulatedSeconds before save: ${accumulatedSecondsInForeground}`);
      clearInterval(foregroundTimer);
      foregroundTimer = null;
      if (accumulatedSecondsInForeground > 0) {
          // console.log('UsageTracking: App going to background, attempting to save remaining time.');
          saveUsageTimeToFirestore();
      }
    } else {
      // console.log('UsageTracking: No foreground timer to clear.');
       // タイマーがない場合でも、何らかの原因で蓄積時間がある可能性を考慮 (ほぼないはずだが念のため)
      if (accumulatedSecondsInForeground > 0) {
        // console.log('UsageTracking: No timer, but accumulated seconds exist. Attempting to save.');
        saveUsageTimeToFirestore();
      }
    }
  }
};

// サービスの初期化
export const initializeUsageTracking = () => {
  // console.log(`UsageTracking: Initializing. Current AppState: ${AppState.currentState}.`);
  
  // 初期状態でフォアグラウンドの場合、タイマーを開始
  if (AppState.currentState === 'active') {
    if (!foregroundTimer) {
      // console.log(`UsageTracking: Starting foreground timer on init. accumulatedSeconds: ${accumulatedSecondsInForeground}`);
      foregroundTimer = setInterval(() => {
        accumulatedSecondsInForeground++;
        if (accumulatedSecondsInForeground >= SAVE_INTERVAL_SECONDS) {
          saveUsageTimeToFirestore();
        }
      }, 1000);
    }
  }

  const subscription = AppState.addEventListener('change', handleAppStateChange);
  // console.log('UsageTracking: Listener attached.');

  return () => {
    // console.log('UsageTracking: Cleaning up.');
    subscription.remove();
    if (foregroundTimer) {
      clearInterval(foregroundTimer);
      foregroundTimer = null;
    }
    if (accumulatedSecondsInForeground > 0) {
        // console.log('UsageTracking: Cleanup, attempting to save remaining time.');
        saveUsageTimeToFirestore();
    }
    // console.log('UsageTracking: Cleaned up.');
  };
};

// 新しいユーティリティ関数
export const getTodaysUsageMinutes = async (): Promise<number> => {
  const currentUser = auth().currentUser;
  if (!currentUser) return 0;

  const userId = currentUser.uid;
  const todayTimestamp = getTodayUtcTimestamp();
  if (!todayTimestamp) return 0;

  try {
    const querySnapshot = await firestore()
      .collection('usageLogs')
      .where('userId', '==', userId)
      .where('date', '==', todayTimestamp)
      .limit(1)
      .get();

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return doc.data().usedMinutes || 0;
    }
    return 0;
  } catch (error) {
    console.error('UsageTracking: Error fetching today\'s usage:', error);
    return 0;
  }
};

export const getAverageUsageMinutesLast30Days = async (): Promise<number> => {
  const currentUser = auth().currentUser;
  if (!currentUser) return 0;

  const userId = currentUser.uid;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 30);
  
  // firestore.Timestamp に変換 (UTCの0時基準に正規化する必要があるか検討)
  // getTodayUtcTimestamp のようなヘルパーを使い、日付範囲をTimestampで指定するのがより正確
  // ここでは簡単のため Date オブジェクトで比較するが、日付が変わる瞬間の扱いに注意が必要
  const startTimestamp = firestore.Timestamp.fromDate(new Date(startDate.setUTCHours(0,0,0,0)));
  const endTimestamp = firestore.Timestamp.fromDate(new Date(endDate.setUTCHours(23,59,59,999))); // 当日を含む

  try {
    const querySnapshot = await firestore()
      .collection('usageLogs')
      .where('userId', '==', userId)
      .where('date', '>=', startTimestamp)
      .where('date', '<=', endTimestamp)
      .get();

    if (querySnapshot.empty) return 0;

    let totalMinutes = 0;
    let daysWithLogs = 0; // 実際にログがあった日数
    const uniqueDates = new Set<string>();

    querySnapshot.forEach(doc => {
      const data = doc.data();
      totalMinutes += data.usedMinutes || 0;
      // Timestampを文字列化してユニークな日付をカウント
      if (data.date && typeof data.date.toDate === 'function') {
        uniqueDates.add(data.date.toDate().toISOString().split('T')[0]);
      }
    });
    
    daysWithLogs = uniqueDates.size;

    // return daysWithLogs > 0 ? Math.round(totalMinutes / daysWithLogs) : 0; // ログがあった日数で割る
    return daysWithLogs > 0 ? Math.round(totalMinutes / 30) : 0; // 常に30で割る（仕様による）
  } catch (error) {
    console.error('UsageTracking: Error fetching average usage:', error);
    return 0;
  }
}; 