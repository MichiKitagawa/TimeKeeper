import { AppState, AppStateStatus, NativeModules, Platform } from 'react-native';
import { getFirestore, Timestamp, FieldValue, collection, where, limit, getDocs, addDoc, updateDoc, doc, query, serverTimestamp } from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';
import {
  EventFrequency,
  checkForPermission,
  queryUsageStats,
  showUsageAccessSettings,
} from '@brighthustle/react-native-usage-stats-manager';
import { getNativeUsageStats, UsageStat, getNativeForegroundApp } from './nativeUsageStats';

// グローバルなタイマーIDとカウンター
let foregroundTimer: NodeJS.Timeout | null = null;
let accumulatedSecondsInForeground = 0; // フォアグラウンドでの累積秒数
const SAVE_INTERVAL_SECONDS = 60; // 60秒（1分）ごとに保存

// ★ 追加: アプリごとの利用時間を格納する型
export interface AppUsageStatsData {
  packageName: string;
  appName: string; // アプリ名も取得できるか確認が必要
  totalTimeInForeground: number; // ミリ秒単位
  lastTimeUsed: number; // 追加: 最後に使用された時間（ミリ秒単位のタイムスタンプ）
}

export interface AppUsage {
  [packageName: string]: number;
}

export interface DailyUsage {
  total: number;
  byApp?: AppUsage; // オプショナルに変更
}

export interface AverageUsage {
  total: number;
  byApp?: AppUsage; // オプショナルに変更
}

const db = getFirestore();
const auth = getAuth();

// 今日の日付の0時0分0秒(UTC)を取得するヘルパー
export const getTodayUtcTimestamp = (): Timestamp | null => {
  try {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    if (isNaN(now.getTime())) {
        console.error('UsageTracking: getTodayUtcTimestamp - Date became invalid.');
        return null;
    }
    return Timestamp.fromDate(now);
  } catch (error) {
    console.error('UsageTracking: Error in getTodayUtcTimestamp:', error);
    return null;
  }
};

// Firestoreに今日の利用時間を保存/更新
export const saveUsageTimeToFirestore = async (currentAppPackageName: string) => {
  console.log(`[UsageTrackingService] saveUsageTimeToFirestore called for app: ${currentAppPackageName}`); // ★ログ追加
  const currentUser = auth.currentUser;
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

  console.log(`UsageTracking: Attempting to save ${minutesToSave} minute(s) for user ${userId} under package ${currentAppPackageName}. Accumulated: ${accumulatedSecondsInForeground}s`);

  const usageLogsCollectionRef = collection(db, 'usageLogs');

  try {
    const q = query(usageLogsCollectionRef, 
                  where('userId', '==', userId),
                  where('date', '==', todayTimestamp),
                  limit(1));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      await addDoc(usageLogsCollectionRef, {
        userId: userId,
        date: todayTimestamp,
        usedMinutes: minutesToSave,
        usedMinutesByPackage: currentAppPackageName ? { [currentAppPackageName]: minutesToSave } : {},
        dailyLimitReached: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const docRef = querySnapshot.docs[0].ref;
      const currentData = querySnapshot.docs[0].data() as { [key: string]: any };
      const currentUsedMinutes = currentData.usedMinutes || 0;
      const currentUsedMinutesByPackage = (currentData.usedMinutesByPackage || {}) as AppUsage; 

      const updateData: { 
        usedMinutes: number;
        usedMinutesByPackage?: AppUsage;
        updatedAt: FieldValue;
      } = {
        usedMinutes: currentUsedMinutes + minutesToSave,
        updatedAt: serverTimestamp(),
      };
      if (currentAppPackageName) { 
        currentUsedMinutesByPackage[currentAppPackageName] = (currentUsedMinutesByPackage[currentAppPackageName] || 0) + minutesToSave;
        updateData.usedMinutesByPackage = currentUsedMinutesByPackage;
      }
      await updateDoc(docRef, updateData);
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
          // saveUsageTimeToFirestore('general'); // ★ 仮で general を指定 -> 変更
          // async IIFE (Immediately Invoked Function Expression) を使用
          (async () => {
            const currentApp = await getCurrentForegroundAppPackage();
            if (currentApp) {
              saveUsageTimeToFirestore(currentApp);
            } else {
              // フォアグラウンドアプリが特定できない場合は一旦 'unknown' として記録するか、何もしない
              // saveUsageTimeToFirestore('unknown_foreground_app');
              console.warn('UsageTracking: Could not determine foreground app for saving interval.');
            }
          })();
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
          // saveUsageTimeToFirestore('general'); // ★ 仮で general を指定 -> 変更
          (async () => {
            const currentApp = await getCurrentForegroundAppPackage(); // バックグラウンド移行直前のアプリ取得を試みる
            if (currentApp) {
              saveUsageTimeToFirestore(currentApp);
            } else {
               console.warn('UsageTracking: Could not determine foreground app for saving on background transition.');
               // フォアグラウンドアプリが特定できない場合、この端数は記録されない
               // accumulatedSecondsInForeground は次のフォアグラウンド時にリセットされるので問題ない
            }
          })();
      }
    } else {
      // console.log('UsageTracking: No foreground timer to clear.');
       // タイマーがない場合でも、何らかの原因で蓄積時間がある可能性を考慮 (ほぼないはずだが念のため)
      if (accumulatedSecondsInForeground > 0) {
        // console.log('UsageTracking: No timer, but accumulated seconds exist. Attempting to save.');
        // saveUsageTimeToFirestore('general'); // ★ 仮で general を指定 -> 変更
        (async () => {
          const currentApp = await getCurrentForegroundAppPackage();
          if (currentApp) {
            saveUsageTimeToFirestore(currentApp);
          } else {
              console.warn('UsageTracking: Could not determine foreground app for saving (no timer).');
          }
        })();
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
          // saveUsageTimeToFirestore('general'); // ★ 仮で general を指定 -> 変更
          (async () => {
            const currentApp = await getCurrentForegroundAppPackage();
            if (currentApp) {
              saveUsageTimeToFirestore(currentApp);
            } else {
               console.warn('UsageTracking: Could not determine foreground app for saving interval (init).');
            }
          })();
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
        // saveUsageTimeToFirestore('general'); // ★ 仮で general を指定 -> 変更
        (async () => {
            const currentApp = await getCurrentForegroundAppPackage();
            if (currentApp) {
                saveUsageTimeToFirestore(currentApp);
            } else {
                console.warn('UsageTracking: Could not determine foreground app for saving on cleanup.');
                // フォアグラウンドアプリが特定できない場合、この端数は記録されない
            }
        })();
    }
    // console.log('UsageTracking: Cleaned up.');
  };
};

// 新しいユーティリティ関数
export const getTodaysUsageMinutes = async (): Promise<DailyUsage> => {
  const currentUser = auth.currentUser;
  if (!currentUser) return { total: 0, byApp: {} };

  const userId = currentUser.uid;
  const todayTimestamp = getTodayUtcTimestamp();
  if (!todayTimestamp) return { total: 0, byApp: {} };

  try {
    const usageLogsCollectionRef = collection(db, 'usageLogs');
    const q = query(usageLogsCollectionRef,
                  where('userId', '==', userId),
                  where('date', '==', todayTimestamp),
                  limit(1));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const docData = querySnapshot.docs[0].data() as { [key: string]: any };
      return { 
        total: docData.usedMinutes || 0,
        byApp: (docData.usedMinutesByPackage || {}) as AppUsage,
      };
    }
    return { total: 0, byApp: {} };
  } catch (error) {
    console.error('UsageTracking: Error fetching today\'s usage:', error);
    return { total: 0, byApp: {} };
  }
};

export const getAverageUsageMinutesLast30Days = async (): Promise<AverageUsage> => {
  const currentUser = auth.currentUser;
  if (!currentUser) return { total: 0, byApp: {} };

  const userId = currentUser.uid;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 30);
  
  const startTimestamp = Timestamp.fromDate(new Date(startDate.setUTCHours(0,0,0,0)));
  const endTimestamp = Timestamp.fromDate(new Date(endDate.setUTCHours(23,59,59,999))); 

  try {
    const usageLogsCollectionRef = collection(db, 'usageLogs');
    const q = query(usageLogsCollectionRef,
                  where('userId', '==', userId),
                  where('date', '>=', startTimestamp),
                  where('date', '<=', endTimestamp));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) return { total: 0, byApp: {} };

    let totalMinutesSum = 0;
    const appMinutesSum: AppUsage = {};

    querySnapshot.forEach(doc => {
      const data = doc.data();
      totalMinutesSum += data.usedMinutes || 0;
      
      const usedByPackage = (data.usedMinutesByPackage || {}) as AppUsage;
      for (const packageName in usedByPackage) {
        appMinutesSum[packageName] = (appMinutesSum[packageName] || 0) + usedByPackage[packageName];
      }
    });
    
    const daysToAverage = 30;

    const averageTotal = Math.round(totalMinutesSum / daysToAverage);
    const averageByApp: AppUsage = {};
    for (const packageName in appMinutesSum) {
      averageByApp[packageName] = Math.round(appMinutesSum[packageName] / daysToAverage);
    }

    return {
      total: averageTotal,
      byApp: averageByApp,
    };
  } catch (error) {
    console.error('UsageTracking: Error fetching average usage:', error);
    return { total: 0, byApp: {} };
  }
};

// アプリごとの利用統計を取得 (指定期間)
// 期間の指定方法を変更: daysAgo から startDate, endDate へ
export const getAppUsageStats = async (
  startDate: Date,
  endDate: Date,
): Promise<AppUsageStatsData[]> => {
  try {
    const hasPermission = await checkForPermission();
    console.log(`[getAppUsageStats] Permission checked. Has permission: ${hasPermission}`);
    if (!hasPermission) {
      console.warn('Usage stats permission not granted. Please grant permission in settings.');
      // 利用状況アクセスの設定画面を開くようユーザーに促す
      // この関数内で showUsageAccessSettings を呼ぶと、ユーザーの操作完了を待てないため、
      // 呼び出し元でパーミッション状態をハンドリングし、必要なら設定画面を開くようにする方が制御しやすい。
      // ここでは、許可がない場合は空の配列を返す。
      // showUsageAccessSettings('TimekeeperApp'); // ここで呼ぶのは避ける
      return [];
    }

    console.log(`[getAppUsageStats] Original dates: startDate=${startDate.toISOString()}, endDate=${endDate.toISOString()}`);
    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();
    console.log(`[getAppUsageStats] Fetching usage stats with timestamps: start=${startTimestamp}, end=${endTimestamp}`);

    // ネイティブモジュールから利用履歴を取得
    const nativeStats = await getNativeUsageStats(startTimestamp, endTimestamp);

    // ネイティブモジュールから取得したデータを処理
    const stats: AppUsageStatsData[] = nativeStats.map(stat => ({
      packageName: stat.packageName,
      appName: stat.appName,
      totalTimeInForeground: stat.totalTimeInForeground,
      lastTimeUsed: stat.lastTimeUsed,
    }));

    return stats;
  } catch (error) {
    console.error('Error getting app usage stats:', error);
    return [];
  }
};

// 現在フォアグラウンドのアプリのパッケージ名を取得する (Androidのみ)
// 注意: この方法は確実ではないかもしれない。ライブラリが直接的な機能を提供していない場合、
// ネイティブモジュールを自作するか、他の方法を探す必要がある。
// react-native-usage-stats-manager にフォアグラウンドアプリ取得機能があるか確認が必要。
// なければ、既存の saveUsageTimeToFirestore の引数の扱いは再検討。
// (例: AppStateの変更時に最後に操作していたアプリを特定する、など)
// ここでは、フォアグラウンドのアプリを特定する処理を仮置きする。
// Androidの UsageStatsManager は直近のフォアグラウンドアプリを取得するAPIがあるが、
// それをReact Nativeから簡単に呼び出せるかはライブラリ次第。

export const getCurrentForegroundAppPackage = async (): Promise<string | null> => {
  if (Platform.OS !== 'android') return null;

  try {
    // ネイティブモジュールからフォアグラウンドアプリを取得
    const packageName = await getNativeForegroundApp();
    console.log(`[UsageTrackingService] getNativeForegroundApp returned: ${packageName}`); // ★ログ追加
    return packageName;
  } catch (error) {
    console.error("[UsageTrackingService] Error in getCurrentForegroundAppPackage:", error);
    return null;
  }
}; 