import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';

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

/**
 * 退会処理（返金要求）。Cloud Function を呼び出し、チャレンジステータスを更新する。
 * @param userId ユーザーID
 * @param challengeId チャレンジID
 * @returns ギフトコード情報を含むオブジェクト
 */
export const requestRefund = async (userId: string, challengeId: string) => {
  if (!userId || !challengeId) {
    throw new Error('ユーザーIDまたはチャレンジIDが必要です。');
  }
  try {
    // Cloud Function を呼び出し
    const issueGiftCard = functions().httpsCallable('issueAmazonGiftCard');
    const result = await issueGiftCard({ userId }); // 必要に応じて他のデータも渡す
    
    // 期待するレスポンスの型定義
    interface GiftCardResponse {
      giftCode: string;
      amount: number;
      message?: string;
    }

    const responseData = result.data as GiftCardResponse; // 型アサーション

    // 型ガードを修正
    if (!responseData || typeof responseData.giftCode !== 'string' || typeof responseData.amount !== 'number') {
      throw new Error('Cloud Functionからのレスポンス形式が不正です。');
    }

    // チャレンジステータスを更新
    const challengeRef = firestore().collection('challenges').doc(challengeId);
    await challengeRef.update({
      status: 'completed_refund' as const,
      endDate: firestore.FieldValue.serverTimestamp(), // 完了日時を記録
      // 必要であればギフトコード情報も保存
      // giftCode: responseData.giftCode,
      // refundedAmount: responseData.amount
    });

    // (オプション) usersコレクションのchallengeIdをクリアするなども検討
    // const userRef = firestore().collection('users').doc(userId);
    // await userRef.update({ challengeId: null });

    return responseData; // 修正: responseDataを返す
  } catch (error) {
    console.error('退会・返金処理エラー:', error);
    if (error instanceof Error) {
      throw new Error(`退会処理に失敗しました: ${error.message}`);
    }
    throw new Error('退会処理中に不明なエラーが発生しました。');
  }
};

/**
 * チャレンジ継続処理。チャレンジステータスを更新する。
 * @param userId ユーザーID
 * @param challengeId チャレンジID
 */
export const continueChallenge = async (userId: string, challengeId: string) => {
  if (!userId || !challengeId) {
    throw new Error('ユーザーIDまたはチャレンジIDが必要です。');
  }
  try {
    const challengeRef = firestore().collection('challenges').doc(challengeId);
    await challengeRef.update({
      status: 'completed_continue' as const,
      // endDate は設定しないか、あるいは新しいチャレンジ開始時にリセットされる想定
    });

    // usersコレクションのchallengeIdは新しいチャレンジ作成時に更新される想定なのでここではクリアしない
    // （あるいは、一旦nullにしてDepositScreenで再設定を促すか）
    // const userRef = firestore().collection('users').doc(userId);
    // await userRef.update({ challengeId: null });

    console.log(`チャレンジID: ${challengeId} のステータスを completed_continue に更新しました。`);
  } catch (error) {
    console.error('継続処理エラー:', error);
    if (error instanceof Error) {
      throw new Error(`継続処理に失敗しました: ${error.message}`);
    }
    throw new Error('継続処理中に不明なエラーが発生しました。');
  }
}; 