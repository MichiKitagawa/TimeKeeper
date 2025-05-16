import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export interface UserTimeSettings {
  initialLimitMinutes: number;
}

/**
 * ユーザーの初回時間設定と新しいチャレンジの作成を行う。
 * Firestoreトランザクションを使用し、usersとchallengesコレクションへの書き込みをアトミックに行う。
 * @param settings 設定する時間（分単位）
 * @returns 作成されたチャレンジのID
 * @throws エラーが発生した場合
 */
export const setUserInitialTimeLimitAndCreateChallenge = async (
  settings: UserTimeSettings
): Promise<string> => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('ユーザーが認証されていません。ログインしてください。');
  }

  const userId = currentUser.uid;
  const userDocRef = firestore().collection('users').doc(userId);
  const newChallengeRef = firestore().collection('challenges').doc(); // 新しいチャレンジのドキュメント参照を先に作成

  try {
    await firestore().runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userDocRef);

      if (userDoc.exists === true && userDoc.data()?.currentLimit != null) {
        throw new Error('時間設定は初回のみ可能です。');
      }

      transaction.set(
        userDocRef,
        {
          currentLimit: settings.initialLimitMinutes,
          challengeId: newChallengeRef.id,
          updatedAt: firestore.FieldValue.serverTimestamp(),
          createdAt: userDoc.exists === true ? userDoc.data()?.createdAt : firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(newChallengeRef, {
        userId: userId,
        initialLimitMinutes: settings.initialLimitMinutes,
        currentDailyLimitMinutes: settings.initialLimitMinutes, // 初期値として設定（Cloud Functionsが日次で更新）
        status: 'active' as const,
        startDate: firestore.FieldValue.serverTimestamp(),
        // endDate, targetDays, remainingDays はここでは設定しない (必要に応じて後から追加)
      });
    });
    return newChallengeRef.id; // 成功したら新しいチャレンジIDを返す
  } catch (error) {
    console.error('時間設定とチャレンジ作成エラー:', error);
    if (error instanceof Error) {
      throw new Error(`時間設定の保存に失敗しました: ${error.message}`);
    }
    throw new Error('時間設定の保存中に不明なエラーが発生しました。');
  }
}; 