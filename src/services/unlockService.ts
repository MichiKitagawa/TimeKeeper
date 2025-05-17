import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

const BASE_FEE = 200;
const MULTIPLIER_INCREMENT = 1.2;

export interface UnlockLogData {
  userId: string;
  date: FirebaseFirestoreTypes.Timestamp;
  unlockFee: number;
  previousMultiplier: number; // 今回の料金計算に適用された倍率
  newMultiplier: number;     // 次回アンロック時に基本料金に適用されるべき倍率
  unlockUntil?: FirebaseFirestoreTypes.Timestamp; // Optional: ロックが解除される期限
}

// ユーザーの最新のアンロックログを取得
export const getLatestUnlockLog = async (userId: string): Promise<UnlockLogData | null> => {
  try {
    const snapshot = await firestore()
      .collection('unlockLogs')
      .where('userId', '==', userId)
      .orderBy('date', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data() as UnlockLogData;
  } catch (error) {
    console.error("Error fetching latest unlock log: ", error);
    throw error; // エラーを呼び出し元に伝える
  }
};

// 次のアンロック料金と関連情報を計算
export const calculateUnlockDetails = async (userId: string): Promise<{
  fee: number;
  previousMultiplierToSave: number;
  newMultiplierToSave: number;
}> => {
  const latestUnlockLog = await getLatestUnlockLog(userId);

  if (!latestUnlockLog) { // 初回アンロック
    return {
      fee: BASE_FEE,
      previousMultiplierToSave: 1.0,
      newMultiplierToSave: MULTIPLIER_INCREMENT,
    };
  }

  // 2回目以降のアンロック料金計算
  // 「以降前回料金x1.2倍」の仕様をデータモデルの倍率で解釈し、
  // 「基本料金 * (前回適用された倍率の1.2倍)」とする。
  // latestUnlockLog.newMultiplier は「前回アンロック時に決定された、今回適用すべき倍率」
  const fee = BASE_FEE * latestUnlockLog.newMultiplier;
  const previousMultiplierToSave = latestUnlockLog.newMultiplier;
  const newMultiplierToSave = latestUnlockLog.newMultiplier * MULTIPLIER_INCREMENT;

  return {
    fee,
    previousMultiplierToSave,
    newMultiplierToSave,
  };
};

// 今日の日付の0時0分0秒(UTC)を取得
const getTodayUtcTimestamp = (): FirebaseFirestoreTypes.Timestamp => {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return firestore.Timestamp.fromDate(now);
};

// アンロック処理を実行し、ログを記録
export const processUnlock = async (
  userId: string,
  fee: number,
  previousMultiplier: number,
  newMultiplier: number
): Promise<void> => {
  const todayStart = getTodayUtcTimestamp();
  const now = firestore.Timestamp.now();

  // アンロックログを記録
  await firestore().collection('unlockLogs').add({
    userId,
    date: now,
    unlockFee: fee,
    previousMultiplier,
    newMultiplier,
    // unlockUntil: // 仕様に応じて設定。今回は usageLogs の dailyLimitReached を更新することで対応
  });

  // usageLogs の dailyLimitReached を false に更新
  const usageLogQuery = firestore()
    .collection('usageLogs')
    .where('userId', '==', userId)
    .where('date', '==', todayStart)
    .limit(1);

  const usageLogSnapshot = await usageLogQuery.get();
  if (!usageLogSnapshot.empty) {
    const usageLogDocRef = usageLogSnapshot.docs[0].ref;
    await usageLogDocRef.update({ dailyLimitReached: false });
    console.log('Usage log updated for unlock.');
  } else {
    // 本来 MainScreen で usageLog がなければ作成されるはずだが、念のため
    console.warn('No usage log found for today to update dailyLimitReached for user:', userId);
    // 必要であればここで作成して dailyLimitReached を false にする
    // await firestore().collection('usageLogs').add({
    //   userId,
    //   date: todayStart,
    //   usedMinutes: 0, // アンロック時点での使用時間は変わらない
    //   dailyLimitReached: false,
    // });
  }
}; 