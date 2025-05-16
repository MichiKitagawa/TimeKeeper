import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

export const dailyScheduledBatch = functions.region("asia-northeast1") // 東京リージョンを指定
  .pubsub.schedule("every day 00:00") // 毎日午前0時に実行
  .timeZone("Asia/Tokyo") // 日本時間を指定
  .onRun(async (context) => {
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

      snapshot.forEach(doc => {
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