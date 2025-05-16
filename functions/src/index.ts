import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

export const dailyScheduledBatch = functions.region("asia-northeast1") // 東京リージョンを指定
  .pubsub.schedule("every day 00:00") // 毎日午前0時に実行
  .timeZone("Asia/Tokyo") // 日本時間を指定
  .onRun(async (context: functions.EventContext) => {
    functions.logger.info("Batch job started: dailyScheduledBatch", {structuredData: true});

    const activeChallengesRef = db.collection("challenges").where("status", "==", "active");

    try {
      const snapshot = await activeChallengesRef.get();

      if (snapshot.empty) {
        functions.logger.info("No active challenges found.");
        return null;
      }

      const batch = db.batch();
      let updatedCount = 0;

      snapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
        const challenge = doc.data();
        const newDailyLimit = Math.max(0, (challenge.currentDailyLimitMinutes || 0) - 1);
        let newRemainingDays = challenge.remainingDays;

        if (typeof newRemainingDays === 'number') {
          newRemainingDays = Math.max(0, newRemainingDays -1);
        }
        // remainingDays が null または undefined の場合は何もしないか、初期値を設定する
        // 今回は null のまま、または存在しない場合はそのままにする

        const updateData: { currentDailyLimitMinutes: number; remainingDays?: number } = {
          currentDailyLimitMinutes: newDailyLimit,
        };

        if (typeof newRemainingDays === 'number') {
          updateData.remainingDays = newRemainingDays;
        }
        
        batch.update(doc.ref, updateData);
        updatedCount++;
      });

      await batch.commit();
      functions.logger.info(`Batch job successful: Updated ${updatedCount} challenges.`);
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