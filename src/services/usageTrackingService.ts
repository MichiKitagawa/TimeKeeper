import { AppState, AppStateStatus } from 'react-native';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

// グローバルなタイマーIDとカウンター
let foregroundTimer: NodeJS.Timeout | null = null;
let accumulatedSecondsInForeground = 0; // フォアグラウンドでの累積秒数
const SAVE_INTERVAL_SECONDS = 60; // 60秒（1分）ごとに保存

// 今日の日付の0時0分0秒(UTC)を取得するヘルパー
const getTodayUtcTimestamp = (): FirebaseFirestoreTypes.Timestamp => {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return firestore.Timestamp.fromDate(now);
};

// usageLogドキュメントID（仮。実際にはクエリで特定）
// const getUsageLogDocId = (userId: string): string => {
//   const today = new Date();
//   const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
//   return `${userId}_${dateStr}`;
// };

// Firestoreに今日の利用時間を保存/更新
const saveUsageTimeToFirestore = async () => {
  const currentUser = auth().currentUser;
  if (!currentUser || accumulatedSecondsInForeground < SAVE_INTERVAL_SECONDS) { // ユーザーがいないか、更新するほどの時間が経っていなければ何もしない
    if (accumulatedSecondsInForeground > 0 && accumulatedSecondsInForeground < SAVE_INTERVAL_SECONDS) {
        console.log(`UsageTracking: Not enough time to save, accumulated: ${accumulatedSecondsInForeground}s`);
    }
    return;
  }

  const userId = currentUser.uid;
  const todayTimestamp = getTodayUtcTimestamp();
  const minutesToSave = Math.floor(accumulatedSecondsInForeground / 60);

  if (minutesToSave === 0) {
    console.log('UsageTracking: No full minutes to save.');
    accumulatedSecondsInForeground = accumulatedSecondsInForeground % 60; // 端数は保持
    return;
  }

  console.log(`UsageTracking: Saving ${minutesToSave} minute(s) for user ${userId}`);

  const usageLogsRef = firestore().collection('usageLogs');

  try {
    // 今日のログがあるか確認
    const querySnapshot = await usageLogsRef
      .where('userId', '==', userId)
      .where('date', '==', todayTimestamp)
      .limit(1)
      .get();

    let docRef: FirebaseFirestoreTypes.DocumentReference;
    let currentUsedMinutes = 0;

    if (querySnapshot.empty) {
      // 新規作成
      console.log('UsageTracking: Creating new usage log for today.');
      docRef = usageLogsRef.doc(); // 自動ID
      await docRef.set({
        userId: userId,
        date: todayTimestamp,
        usedMinutes: minutesToSave,
        dailyLimitReached: false, // 初期値。MainScreenで判定・更新する
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // 更新
      const doc = querySnapshot.docs[0];
      docRef = doc.ref;
      currentUsedMinutes = doc.data().usedMinutes || 0;
      console.log(`UsageTracking: Updating existing usage log. Current: ${currentUsedMinutes} min.`);
      await docRef.update({
        usedMinutes: currentUsedMinutes + minutesToSave,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    }
    accumulatedSecondsInForeground = accumulatedSecondsInForeground % 60; // 保存した分の秒数をリセットし、端数を保持
    console.log(`UsageTracking: Successfully saved ${minutesToSave} minute(s). Remaining seconds: ${accumulatedSecondsInForeground}`);
  } catch (error) {
    console.error('UsageTracking: Error saving usage time to Firestore:', error);
  }
};


// AppStateの変更を監視
const handleAppStateChange = (nextAppState: AppStateStatus) => {
  if (nextAppState === 'active') {
    console.log('UsageTracking: App has come to the foreground!');
    if (!foregroundTimer) {
      // 1秒ごとにフォアグラウンド時間を加算
      foregroundTimer = setInterval(() => {
        accumulatedSecondsInForeground++;
        // console.log(`UsageTracking: Accumulated seconds: ${accumulatedSecondsInForeground}`);
        if (accumulatedSecondsInForeground >= SAVE_INTERVAL_SECONDS) {
          saveUsageTimeToFirestore();
        }
      }, 1000);
    }
  } else {
    console.log('UsageTracking: App has gone to the background or inactive.');
    if (foregroundTimer) {
      clearInterval(foregroundTimer);
      foregroundTimer = null;
    }
    // バックグラウンドに移行する直前に、残っている時間を保存試行
    if (accumulatedSecondsInForeground > 0) {
        console.log('UsageTracking: App going to background, attempting to save remaining time.');
        saveUsageTimeToFirestore();
    }
  }
};

// サービスの初期化
export const initializeUsageTracking = () => {
  // 初期状態でフォアグラウンドの場合の処理も考慮
  if (AppState.currentState === 'active') {
    if (!foregroundTimer) {
        foregroundTimer = setInterval(() => {
            accumulatedSecondsInForeground++;
            if (accumulatedSecondsInForeground >= SAVE_INTERVAL_SECONDS) {
              saveUsageTimeToFirestore();
            }
        }, 1000);
    }
  }

  const subscription = AppState.addEventListener('change', handleAppStateChange);
  console.log('UsageTracking: Service initialized and AppState listener attached.');

  return () => {
    subscription.remove();
    if (foregroundTimer) {
      clearInterval(foregroundTimer);
      foregroundTimer = null;
    }
    // アプリ終了時などに最後に保存試行 (実際には呼ばれる保証は薄い)
    if (accumulatedSecondsInForeground > 0) {
        console.log('UsageTracking: Service cleanup, attempting to save remaining time.');
        saveUsageTimeToFirestore();
    }
    console.log('UsageTracking: Service cleaned up and AppState listener removed.');
  };
}; 