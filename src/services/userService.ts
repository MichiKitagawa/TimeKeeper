import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
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

      if (userDoc.exists() && userDoc.data()?.currentLimit != null) {
        throw new Error('時間設定は初回のみ可能です。');
      }

      transaction.set(
        userDocRef,
        {
          currentLimit: settings.initialLimitMinutes,
          challengeId: newChallengeRef.id,
          updatedAt: firestore.FieldValue.serverTimestamp(),
          createdAt: userDoc.exists() ? userDoc.data()?.createdAt : firestore.FieldValue.serverTimestamp(),
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
    // チャレンジステータスを更新
    const challengeRef = firestore().collection('challenges').doc(challengeId);
    await challengeRef.update({
      status: 'completed_refund' as const,
      endDate: firestore.FieldValue.serverTimestamp(), // 完了日時を記録
    });

    // (オプション) usersコレクションのchallengeIdをクリアするなども検討
    // const userRef = firestore().collection('users').doc(userId);
    // await userRef.update({ challengeId: null });

    // ここでユーザーデータの削除または匿名化処理を呼び出す (オプション)
    // await deleteOrAnonymizeUserData(userId); // 将来的に実装

    return { message: '返金処理を受け付けました。詳細は別途通知されます。' }; // 固定メッセージを返すように変更
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

/**
 * (オプション) ユーザーデータの削除または匿名化を行うCloud Functionを呼び出す（将来的な実装）。
 * 現在はスタブとして定義。
 * @param userId 削除/匿名化対象のユーザーID
 */
export const deleteOrAnonymizeUserData = async (userId: string): Promise<void> => {
  if (!userId) {
    throw new Error('ユーザーIDが必要です。');
  }
  try {
    console.log(`[userService] 将来的にCloud Functionを呼び出してユーザー ${userId} のデータを削除/匿名化します。`);
    // const deleteFunction = functions().httpsCallable('deleteUserData'); // 仮の関数名
    // await deleteFunction({ userId });
    // console.log(`ユーザー ${userId} のデータ削除/匿名化処理を要求しました。`);
  } catch (error) {
    console.error(`ユーザー ${userId} のデータ削除/匿名化処理中にエラー:`, error);
    // ここではエラーをスローせず、ログに記録するに留める（アプリのフローを止めないため）。
    // 必要に応じてエラーハンドリング戦略を見直す。
  }
};

/**
 * ユーザーの最終アクティブ日時を更新する。
 * @returns Promise<void>
 * @throws エラーが発生した場合
 */
export const updateLastActiveDate = async (): Promise<void> => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    // ユーザーが認証されていない場合は何もしないか、エラーをスローするか選択
    // ここではコンソールに警告を出すに留める
    console.warn('[updateLastActiveDate] ユーザーが認証されていません。');
    return;
  }

  const userId = currentUser.uid;
  const userDocRef = firestore().collection('users').doc(userId);

  try {
    await userDocRef.update({
      lastActiveDate: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(), // updatedAtも併せて更新
    });
    console.log(`[updateLastActiveDate] ユーザー ${userId} の最終アクティブ日時を更新しました。`);
  } catch (error) {
    console.error(`[updateLastActiveDate] ユーザー ${userId} の最終アクティブ日時更新エラー:`, error);
    // エラーを再スローするかどうかは呼び出し側の要件による
    // throw error;
  }
};

/**
 * ユーザーが非アクティブかどうかを判定する。
 * @param inactiveThresholdDays 非アクティブと見なす閾値（日数）。デフォルトは7日。
 * @returns Promise<boolean> 非アクティブであればtrue、そうでなければfalse。
 * @throws エラーが発生した場合（ユーザー未認証、ユーザーデータ取得失敗など）
 */
export const isUserInactive = async (inactiveThresholdDays: number = 7): Promise<boolean> => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('[isUserInactive] ユーザーが認証されていません。');
  }

  const userId = currentUser.uid;
  const userDocRef = firestore().collection('users').doc(userId);

  try {
    const userDoc = await userDocRef.get();
    if (!userDoc.exists()) {
      // ユーザードキュメントが存在しない場合は、新規ユーザーまたはエラーケース
      // ここでは非アクティブとは見なさない（あるいは特定の初期状態として扱う）
      console.warn(`[isUserInactive] ユーザー ${userId} のドキュメントが存在しません。`);
      return false; 
    }

    const userData = userDoc.data();
    if (!userData || !userData.lastActiveDate) {
      // lastActiveDate がない場合も、非アクティブとは見なさない（または初回アクセスと見なす）
      console.warn(`[isUserInactive] ユーザー ${userId} の lastActiveDate が存在しません。`);
      return false;
    }

    const lastActiveTimestamp = userData.lastActiveDate as FirebaseFirestoreTypes.Timestamp;
    const lastActiveDateTime = lastActiveTimestamp.toDate();
    const now = new Date();
    
    const diffTime = Math.abs(now.getTime() - lastActiveDateTime.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > inactiveThresholdDays) {
      console.log(`[isUserInactive] ユーザー ${userId} は非アクティブです（最終アクティブから ${diffDays}日経過）。`);
      return true;
    }

    console.log(`[isUserInactive] ユーザー ${userId} はアクティブです（最終アクティブから ${diffDays}日経過）。`);
    return false;

  } catch (error) {
    console.error(`[isUserInactive] ユーザー ${userId} の非アクティブ状態判定エラー:`, error);
    // エラー発生時は、安全側に倒して非アクティブではないと見なすか、エラーをスローするか検討
    // ここではエラーをスローして呼び出し元でハンドリングさせる
    throw error;
  }
};

/**
 * ユーザーの支払いステータスを取得する。
 * @returns Promise<{ status: string | null, paymentId: string | null } | null> 支払い情報、またはユーザーデータが存在しない場合はnull。
 * @throws エラーが発生した場合（ユーザー未認証など）
 */
export const getUserPaymentStatus = async (): Promise<{ status: string | null; paymentId: string | null } | null> => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('[getUserPaymentStatus] ユーザーが認証されていません。');
  }

  const userId = currentUser.uid;
  const userDocRef = firestore().collection('users').doc(userId);

  try {
    const userDoc = await userDocRef.get();
    if (!userDoc.exists()) {
      console.warn(`[getUserPaymentStatus] ユーザー ${userId} のドキュメントが存在しません。`);
      return null; // 新規ユーザーやデータ未作成の場合
    }

    const userData = userDoc.data();
    return {
      status: userData?.paymentStatus || null,
      paymentId: userData?.paymentId || null,
    };
  } catch (error) {
    console.error(`[getUserPaymentStatus] ユーザー ${userId} の支払いステータス取得エラー:`, error);
    throw error; // エラーを呼び出し元でハンドリングさせる
  }
}; 