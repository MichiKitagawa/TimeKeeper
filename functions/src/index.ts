import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

// usersドキュメントのデータ型 (必要な部分のみ)
interface UserData {
  uid: string;
  timeLimitSet?: boolean;
  paymentCompleted?: boolean;
  // currentChallengeId?: string; // チャレンジ機能削除に伴い不要
  initialDailyUsageLimit?: { total: number | null; byApp?: { [key: string]: number } };
  currentDailyUsageLimit?: { total: number | null; byApp?: { [key: string]: number } }; // これはTimeSettingScreenで設定されたcurrentLimitと同値になる想定
  currentLimit?: { total: number | null; byApp?: { [key: string]: number } }; 
}

// challengesドキュメントのデータ型は不要なので削除
/*
interface ChallengeData {
    userId: string;
    initialLimitMinutes?: number;
    currentDailyLimitMinutes?: number;
    targetLimitMinutes?: number;
    status?: string;
    remainingDays?: number | null;
}
*/

export const dailyScheduledBatch = functions.region("asia-northeast1")
  .pubsub.schedule("every day 00:00") // JSTの午前0時
  .timeZone("Asia/Tokyo")
  .onRun(async (context: functions.EventContext) => {
    functions.logger.info("Batch job started: dailyScheduledBatch (No-op as per new spec)", {structuredData: true});

    // 現状、日次バッチでユーザーの currentDailyUsageLimit を自動更新するロジックは不要になりました。
    // currentDailyUsageLimit は TimeSettingScreen でユーザーが設定した currentLimit と同値として設定され、
    // 日々変動するものではなくなります。
    // 将来的に日次処理が必要になった場合に備えて、基本的な構造のみ残します。

    const activeUsersRef = db.collection("users")
                                .where("timeLimitSet", "==", true)
                                .where("paymentCompleted", "==", true);

    try {
      const usersSnapshot = await activeUsersRef.get();

      if (usersSnapshot.empty) {
        functions.logger.info("No active users found for daily processing.");
        return null;
      }

      // const batch = db.batch(); // 更新処理がないためバッチも不要
      // let updatedUsersCount = 0;

      usersSnapshot.forEach((userDocSnap: admin.firestore.QueryDocumentSnapshot) => {
        // const userData = userDocSnap.data() as UserData;
        // const userId = userDocSnap.id;

        // ユーザーごとの日次処理が必要な場合はここに記述
        // 例: functions.logger.info(`Processing user ${userId} for daily tasks.`);
        
        // currentDailyUsageLimit の自動減少ロジックは削除されました。
        // チャレンジ関連の更新も削除されました。
      });

      // await batch.commit(); // 更新処理がないためコミットも不要
      functions.logger.info(`Batch job successful: Daily processing for ${usersSnapshot.size} users considered (no specific updates performed).`);
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