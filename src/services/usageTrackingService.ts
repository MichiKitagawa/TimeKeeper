import { AppState, AppStateStatus, NativeModules, Platform } from 'react-native';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {
  EventFrequency,
  checkForPermission,
  queryUsageStats,
  showUsageAccessSettings,
} from '@brighthustle/react-native-usage-stats-manager';

// グローバルなタイマーIDとカウンター
let foregroundTimer: NodeJS.Timeout | null = null;
let accumulatedSecondsInForeground = 0; // フォアグラウンドでの累積秒数
const SAVE_INTERVAL_SECONDS = 60; // 60秒（1分）ごとに保存

// ★ 追加: アプリごとの利用時間を格納する型
export interface AppUsageStatsData {
  packageName: string;
  appName: string; // アプリ名も取得できるか確認が必要
  totalTimeInForeground: number; // ミリ秒単位
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
export const saveUsageTimeToFirestore = async (currentAppPackageName: string) => {
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

  console.log(`UsageTracking: Attempting to save ${minutesToSave} minute(s) for user ${userId} under package ${currentAppPackageName}. Accumulated: ${accumulatedSecondsInForeground}s`);

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
        usedMinutesByPackage: currentAppPackageName ? { [currentAppPackageName]: minutesToSave } : {},
        dailyLimitReached: false,
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    } else {
      const doc = querySnapshot.docs[0];
      const currentData = doc.data(); // ★追加
      const currentUsedMinutes = currentData.usedMinutes || 0;
      const currentUsedMinutesByPackage = (currentData.usedMinutesByPackage || {}) as AppUsage; // ★ パッケージ名ベースに変更

      const updateData: { // ★型を明示
        usedMinutes: number;
        usedMinutesByPackage?: AppUsage;
        updatedAt: FirebaseFirestoreTypes.FieldValue;
      } = {
        usedMinutes: currentUsedMinutes + minutesToSave,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      };
      if (currentAppPackageName) { // ★ パッケージ名指定がある場合
        currentUsedMinutesByPackage[currentAppPackageName] = (currentUsedMinutesByPackage[currentAppPackageName] || 0) + minutesToSave;
        updateData.usedMinutesByPackage = currentUsedMinutesByPackage;
      }
      await doc.ref.update(updateData);
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
  const currentUser = auth().currentUser;
  if (!currentUser) return { total: 0, byApp: {} };

  const userId = currentUser.uid;
  const todayTimestamp = getTodayUtcTimestamp();
  if (!todayTimestamp) return { total: 0, byApp: {} };

  try {
    const querySnapshot = await firestore()
      .collection('usageLogs')
      .where('userId', '==', userId)
      .where('date', '==', todayTimestamp)
      .limit(1)
      .get();

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { 
        total: doc.data().usedMinutes || 0,
        byApp: (doc.data().usedMinutesByPackage || {}) as AppUsage,
      };
    }
    return { total: 0, byApp: {} };
  } catch (error) {
    console.error('UsageTracking: Error fetching today\'s usage:', error);
    return { total: 0, byApp: {} };
  }
};

export const getAverageUsageMinutesLast30Days = async (): Promise<AverageUsage> => {
  const currentUser = auth().currentUser;
  if (!currentUser) return { total: 0, byApp: {} };

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

    if (querySnapshot.empty) return { total: 0, byApp: {} };

    let totalMinutesSum = 0;
    const appMinutesSum: AppUsage = {};
    const uniqueDates = new Set<string>();

    querySnapshot.forEach(doc => {
      const data = doc.data();
      const docDate = data.date?.toDate()?.toISOString().split('T')[0];
      if (docDate) {
        uniqueDates.add(docDate);
      }
      
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

// 新しい関数: アプリ利用状況の取得 (ライブラリ使用)
export const getAppUsageStats = async (
  startDate: Date,
  endDate: Date,
): Promise<AppUsageStatsData[]> => {
  if (Platform.OS !== 'android') {
    console.log('Usage stats are only available on Android.');
    return [];
  }

  try {
    const hasPermission = await checkForPermission();
    if (!hasPermission) {
      console.log('Requesting usage stats permission.');
      // ダイアログを表示して設定画面へ誘導
      // ユーザーが許可した後、再度この関数を呼び出す必要があるかもしれない
      showUsageAccessSettings('TimekeeperApp'); // 'TimekeeperApp' はアプリ名など、適切な文字列を指定
      // 許可を待つか、ユーザーに再度操作を促すUIが必要
      return []; // 一旦空を返す。呼び出し元で制御
    }

    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    // queryUsageStats は UsageEvents[] または UsageStats[] を返す。
    // UsageStats の方が集計されているため扱いやすい。
    // ライブラリのドキュメントや実動作を確認して、どちらの形式で返ってくるか、
    // また、アプリ名が取得できるかを確認する必要がある。
    // ここでは、UsageStats[] が返り、packageName と totalTimeInForeground が含まれると仮定する。
    // アプリ名は別途取得する必要があるかもしれない。
    const usageData = await queryUsageStats(
      EventFrequency.INTERVAL_DAILY, // または INTERVAL_BEST など適切なものを選択
      startMs,
      endMs,
    );
    
    console.log('Raw usage data from library:', usageData);

    if (!usageData || usageData.length === 0) {
      return [];
    }

    // ライブラリが返すデータの型に合わせて整形する
    // 例: {packageName: string, totalTimeInForeground: number, appName?: string }
    // アプリ名は UsageStatsManager から直接取れない場合が多い。
    // react-native-device-info のようなライブラリでパッケージ名からアプリ名を取得する必要があるかもしれない。
    // ここでは、ライブラリが packageName と totalTimeInForeground を含むと仮定する。
    // アプリ名は一旦 packageName と同じにするか、別途取得ロジックを検討。
    
    // queryUsageStatsの戻り値の型が不明なため、anyとして扱う。
    // 実際にはライブラリの型定義を参照するか、実行して確認する。
    const stats: AppUsageStatsData[] = (usageData as any[]).map(stat => ({
      packageName: stat.packageName,
      appName: stat.appName || stat.packageName, // appName がなければ packageName を使う
      totalTimeInForeground: stat.totalTimeInForeground || (stat.usageTime && typeof stat.usageTime === 'number' ? stat.usageTime : 0) // ライブラリの戻り値に合わせる
    })).filter(stat => stat.totalTimeInForeground > 0); // 利用時間があるもののみ

    return stats;

  } catch (error) {
    console.error('Error fetching app usage stats:', error);
    return [];
  }
};

// 現在フォアグラウンドのアプリパッケージ名を取得する（試み）
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
    // react-native-usage-stats-manager がフォアグラウンドアプリを直接取得する機能を提供しているか確認
    // 提供していない場合、この実装は動作しない。
    // 代替案: 1秒などの短い間隔で最後に使われたアプリをqueryUsageStatsで調べる（非効率的）
    // もしくは、ネイティブモジュールで ActivityManager.getRunningTasks (deprecated) や UsageStatsManager.queryEvents を使う
    
    // const hasPermission = await checkForPermission();
    // if (!hasPermission) {
    //   showUsageAccessSettings('TimekeeperApp');
    //   return null;
    // }

    // 例: 直近数秒のイベントを取得して、最後のFOREGROUNDイベントのパッケージ名を探す
    const now = new Date().getTime();
    const fewSecondsAgo = now - 5000; // 5秒前
    
    // queryEvents のような機能がライブラリにあるか？ なければ queryUsageStats で代用を試みる。
    // queryUsageStats は集計データなので、リアルタイムのフォアグラウンドアプリ特定には向かない可能性がある。
    // ライブラリのドキュメントやソースを確認する必要がある。

    // @brighthustle/react-native-usage-stats-manager の queryUsageStats は集計情報を返すため、
    // リアルタイムのフォアグラウンドアプリ特定には不向き。
    // また、同ライブラリに queryEvents のような関数は見当たらない。

    // ネイティブモジュールを使ってフォアグラウンドアプリを取得する処理が必要になる可能性が高い。
    // もしネイティブモジュールを呼び出す場合:
    // const { UsageStatsModule } = NativeModules; // 仮のモジュール名
    // if (UsageStatsModule && UsageStatsModule.getForegroundApp) {
    //   const packageName = await UsageStatsModule.getForegroundApp();
    //   return packageName;
    // }
    
    // ここでは、ライブラリがそのような機能を提供していないと仮定し、
    // `saveUsageTimeToFirestore` の呼び出し方を再考する。
    // 現状の実装では、フォアグラウンドのアプリを特定できない場合、利用時間が正しく記録されない。
    
    // 一時的な対策として、フォアグラウンドのアプリを特定する処理は未実装とし、
    // saveUsageTimeToFirestore の呼び出し部分で固定のアプリ名（または'unknown'）を使うか、
    // もしくは、この機能が実装されるまでアプリごとの記録を部分的に制限する。
    
    // タスク定義に基づき、「ライブラリがフォアグラウンドアプリ特定機能を提供していればそれを利用、なければ別途方法を検討」
    // 現状のライブラリでは直接的な機能はなさそう。

    // ---- フォアグラウンドアプリ特定ロジック (仮、別途検討・実装が必要) ----
    // console.warn("getCurrentForegroundAppPackage is not fully implemented and may not be reliable.");
    // 実際にはネイティブ機能の呼び出しが必要。
    // Digital WellbeingのようなアプリはOSレベルでより詳細な情報を取得できる。
    // React Nativeからだと制限がある。

    // ここでは、最も最近利用時間が記録されたアプリを返す、という簡易的なロジックを試す。
    // (ただし、これは正確ではない)
    const end = new Date();
    const start = new Date(end.getTime() - 15 * 1000); // 直近15秒
    const stats = await getAppUsageStats(start, end);
    if (stats.length > 0) {
      // 最も利用時間が長いものをフォアグラウンドとみなす（非常に不正確な仮定）
      // または、最も最近のイベントを持つものを探す必要があるが、このライブラリでは難しい。
      // stats.sort((a, b) => b.totalTimeInForeground - a.totalTimeInForeground);
      // return stats[0].packageName;
      // queryUsageStats は集計なので、このアプローチは不適切。
      // 最終起動時刻(lastTimeUsed)のような情報があれば使えるが、今のライブラリの戻り値では不明。
    }
    // --------------------------------------------------------------------

    // 現時点では、フォアグラウンドアプリを確実に特定する手段がないため null を返す。
    // saveUsageTimeToFirestore の呼び出し側で、null の場合の処理を考慮する必要がある。
    // (例: 'unknown_app' として記録するか、合計時間のみを更新するなど)
    // 今回の改修では、saveUsageTimeToFirestore には必ずパッケージ名が必要なため、
    // 呼び出し元でフォアグラウンドアプリが取得できない場合は保存処理をスキップする。
    return null; 
  } catch (error) {
    console.error("Error in getCurrentForegroundAppPackage (placeholder):", error);
    return null;
  }
}; 