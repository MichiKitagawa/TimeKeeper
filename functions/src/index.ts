import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

// usersドキュメントのデータ型 (必要な部分のみ)
interface UserData {
  uid: string;
  timeLimitSet?: boolean;
  paymentCompleted?: boolean;
  currentChallengeId?: string;
  initialDailyUsageLimit?: { total: number | null; byApp?: { [key: string]: number } };
  currentDailyUsageLimit?: { total: number | null; byApp?: { [key: string]: number } };
  currentLimit?: { total: number | null; byApp?: { [key: string]: number } };
  // 他にもuserService.tsのUserDocumentDataに合わせたフィールドがあれば追加
}

// challengesドキュメントのデータ型 (必要な部分のみ)
interface ChallengeData {
    userId: string;
    initialLimitMinutes?: number;
    currentDailyLimitMinutes?: number;
    targetLimitMinutes?: number;
    status?: string;
    remainingDays?: number | null; // 残り日数を保持
    // targetDays や daysElapsed を追加することも検討
}

export const dailyScheduledBatch = functions.region("asia-northeast1")
  .pubsub.schedule("every day 00:00")
  .timeZone("Asia/Tokyo")
  .onRun(async (context: functions.EventContext) => {
    functions.logger.info("Batch job started: dailyScheduledBatch", {structuredData: true});

    // アクティブなチャレンジを持つか、時間設定と支払いが完了しているユーザーを対象とする
    // ここでは簡略化のため timeLimitSet と paymentCompleted を持つユーザーを対象
    const activeUsersRef = db.collection("users")
                                .where("timeLimitSet", "==", true)
                                .where("paymentCompleted", "==", true);

    try {
      const usersSnapshot = await activeUsersRef.get();

      if (usersSnapshot.empty) {
        functions.logger.info("No active users found for daily limit reduction.");
        return null;
      }

      const batch = db.batch();
      let updatedUsersCount = 0;

      usersSnapshot.forEach((userDocSnap: admin.firestore.QueryDocumentSnapshot) => {
        const userData = userDocSnap.data() as UserData;
        const userId = userDocSnap.id;

        if (!userData.initialDailyUsageLimit?.byApp || 
            !userData.currentLimit?.byApp || 
            !userData.currentDailyUsageLimit?.byApp) {
          functions.logger.warn(`User ${userId} is missing necessary time limit data. Skipping.`);
          return; // 必要なデータがない場合はスキップ
        }

        const newCurrentDailyUsageByApp: { [key: string]: number } = {};
        let newTotalCurrentDailyUsage = 0;
        let allTargetsReached = true; // 全てのアプリが目標時間に達したか

        for (const pkgName in userData.initialDailyUsageLimit.byApp) {
          const initialLimit = userData.initialDailyUsageLimit.byApp[pkgName]; // このユーザーが設定したこのアプリの初期使用時間
          const targetLimit = userData.currentLimit.byApp[pkgName] ?? 0; // このアプリの目標時間 (未設定なら0)
          // 昨日までの時点で、このアプリの利用が許可されていた時間
          let currentDailyLimitForApp = userData.currentDailyUsageLimit.byApp[pkgName];

          if (typeof currentDailyLimitForApp !== 'number') {
            // currentDailyUsageLimit.byApp[pkgName] が未設定(または数値でない)の場合、initialLimitから開始
            currentDailyLimitForApp = initialLimit;
          }

          let newAppLimit = currentDailyLimitForApp;
          if (currentDailyLimitForApp > targetLimit) {
            newAppLimit = Math.max(targetLimit, currentDailyLimitForApp - 1);
            allTargetsReached = false; // まだ目標に達していないアプリがある
          }
          
          newCurrentDailyUsageByApp[pkgName] = newAppLimit;
          newTotalCurrentDailyUsage += newAppLimit;
        }
        
        // users ドキュメントの更新内容
        const userUpdateData: Partial<UserData> = {
          currentDailyUsageLimit: {
            total: newTotalCurrentDailyUsage,
            byApp: newCurrentDailyUsageByApp,
          },
        };
        batch.update(userDocSnap.ref, userUpdateData);
        updatedUsersCount++;
        functions.logger.info(`User ${userId}: currentDailyUsageLimit updated. New total: ${newTotalCurrentDailyUsage}`);

        // --- challenges コレクションの更新 --- 
        if (userData.currentChallengeId) {
            const challengeRef = db.collection("challenges").doc(userData.currentChallengeId);
            const challengeUpdateData: Partial<ChallengeData> = {
                currentDailyLimitMinutes: newTotalCurrentDailyUsage,
            };

            // remainingDays の更新 (例: 単純に1日減らす。より正確には目標からの差で計算)
            // この部分は要件に合わせて調整が必要
            // const challengeDoc = (await challengeRef.get()).data() as ChallengeData | undefined;
            // if (challengeDoc && typeof challengeDoc.remainingDays === 'number') {
            //    challengeUpdateData.remainingDays = Math.max(0, challengeDoc.remainingDays - 1);
            // }
            
            if (allTargetsReached) {
                // 全てのアプリが目標時間に達した場合、チャレンジステータスを更新することも検討
                // challengeUpdateData.status = "completed_target_reached"; // 例
                // functions.logger.info(`User ${userId}, Challenge ${userData.currentChallengeId}: All targets reached.`);
            }
            batch.update(challengeRef, challengeUpdateData);
            functions.logger.info(`User ${userId}, Challenge ${userData.currentChallengeId}: currentDailyLimitMinutes updated to ${newTotalCurrentDailyUsage}.`);
        }

      });

      await batch.commit();
      functions.logger.info(`Batch job successful: Updated daily limits for ${updatedUsersCount} users.`);
      return null;
    } catch (error) {
      functions.logger.error("Batch job failed: dailyScheduledBatch", error);
      return null;
    }
  }); 

// 新しいHTTPS Callable Function
export const issueAmazonGiftCard = functions.region("asia-northeast1")
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    // 認証チェック
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }

    const userId = context.auth.uid;
    // data からリクエストに必要な情報（例：金額など）を取得するが、今回は使わない
    // const requestAmount = data.amount;

    functions.logger.info(`Issuing Amazon Gift Card for user: ${userId}`, { structuredData: true });

    // Amazon APIキーを環境変数から取得 (例)
    // const apiKey = functions.config().amazon?.apikey;
    // if (!apiKey) {
    //   functions.logger.error("Amazon API key not configured.");
    //   throw new functions.https.HttpsError(
    //     "internal",
    //     "The server is not configured correctly."
    //   );
    // }

    // ここで実際にAmazon APIを呼び出す処理を実装
    // 今回はダミーのギフトコードを返す
    const dummyGiftCode = `DUMMYCODE-${Date.now()}`;
    const dummyGiftValue = 1500; // 仮の金額

    functions.logger.info(`Successfully issued gift card for user: ${userId}, code: ${dummyGiftCode}`);

    // (オプション) ギフト発行ログなどをFirestoreに保存することも検討

    return {
      giftCode: dummyGiftCode,
      amount: dummyGiftValue,
      message: "Successfully issued Amazon Gift Card (dummy).",
    };
  }); 