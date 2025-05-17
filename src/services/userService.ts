import {
  getFirestore,
  serverTimestamp,
  Timestamp,
  getDoc,
  setDoc,
  updateDoc,
  doc,
  runTransaction,
  collection,
  FieldValue,
} from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';

// Firestoreインスタンスを一度だけ取得
const db = getFirestore();

export interface UserFlowStatus {
  averageUsageTimeFetched: boolean;
  timeLimitSet: boolean;
  paymentCompleted: boolean;
  currentChallengeId?: string | null; // 既存のチャレンジIDも返すようにする
  currentLimit?: number | null; // 既存の目標時間も返す
}

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
  const userDocRef = doc(db, 'users', userId);
  const newChallengeRef = doc(collection(db, 'challenges')); // ID自動生成

  try {
    await runTransaction(db, async (transaction) => {
      const userDocSnap = await transaction.get(userDocRef);

      // if (userDocSnap.exists() && userDocSnap.data()?.currentLimit != null) { // 既存のロジックは一旦コメントアウト、もしくは仕様見直し
      //   throw new Error('時間設定は初回のみ可能です。');
      // }

      transaction.set(
        userDocRef,
        {
          currentLimit: settings.initialLimitMinutes,
          challengeId: newChallengeRef.id,
          timeLimitSet: true, // 目標時間設定完了フラグ
          updatedAt: serverTimestamp(),
          createdAt: userDocSnap.exists() ? userDocSnap.data()?.createdAt : serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(newChallengeRef, {
        userId: userId,
        initialLimitMinutes: settings.initialLimitMinutes,
        currentDailyLimitMinutes: settings.initialLimitMinutes,
        status: 'active' as const,
        startDate: serverTimestamp(),
      });
    });
    return newChallengeRef.id;
  } catch (error) {
    console.error('時間設定とチャレンジ作成エラー:', error);
    if (error instanceof Error) {
      // throw new Error(`時間設定の保存に失敗しました: ${error.message}`);
      // 画面側でハンドリングしやすいように、カスタムエラーオブジェクトやエラーコードを返すことも検討
      throw error; 
    }
    throw new Error('時間設定の保存中に不明なエラーが発生しました。');
  }
};

/**
 * 退会処理（返金要求）。チャレンジステータスを更新する。
 * @param userId ユーザーID
 * @param challengeId チャレンジID
 * @returns メッセージ
 */
export const requestRefund = async (userId: string, challengeId: string) => {
  if (!userId || !challengeId) {
    throw new Error('ユーザーIDまたはチャレンジIDが必要です。');
  }
  try {
    const challengeRef = doc(db, 'challenges', challengeId);
    await updateDoc(challengeRef, {
      status: 'completed_refund' as const,
      endDate: serverTimestamp(),
    });
    return { message: '返金処理を受け付けました。詳細は別途通知されます。' };
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
    const challengeRef = doc(db, 'challenges', challengeId);
    await updateDoc(challengeRef, {
      status: 'completed_continue' as const,
    });
    console.log(`チャレンジID: ${challengeId} のステータスを completed_continue に更新しました。`);
  } catch (error) {
    console.error('継続処理エラー:', error);
    if (error instanceof Error) {
      throw new Error(`継続処理に失敗しました: ${error.message}`);
    }
    throw new Error('継続処理中に不明なエラーが発生しました。');
  }
};

export const deleteOrAnonymizeUserData = async (userId: string): Promise<void> => {
  if (!userId) {
    throw new Error('ユーザーIDが必要です。');
  }
  try {
    console.log(`[userService] 将来的にCloud Functionを呼び出してユーザー ${userId} のデータを削除/匿名化します。`);
  } catch (error) {
    console.error(`ユーザー ${userId} のデータ削除/匿名化処理中にエラー:`, error);
  }
};

export const updateLastActiveDate = async (): Promise<void> => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    console.warn('[updateLastActiveDate] ユーザーが認証されていません。');
    return;
  }
  const userId = currentUser.uid;
  const userDocRef = doc(db, 'users', userId);
  try {
    await updateDoc(userDocRef, {
      lastActiveDate: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(`[updateLastActiveDate] ユーザー ${userId} の最終アクティブ日時を更新しました。`);
  } catch (error) {
    console.error(`[updateLastActiveDate] ユーザー ${userId} の最終アクティブ日時更新エラー:`, error);
    throw error;
  }
};

/**
 * ユーザーが非アクティブかどうかを判定する。
 * @param userId ユーザーID
 * @param inactiveThresholdDays 非アクティブと見なす閾値（日数）。デフォルトは7日。
 * @returns Promise<boolean> 非アクティブであればtrue、そうでなければfalse。
 */
export const isUserInactive = async (userId: string, inactiveThresholdDays: number = 7): Promise<boolean> => {
  if (!userId) {
    throw new Error('[isUserInactive] ユーザーIDが指定されていません。');
  }
  const userDocRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      console.warn(`[isUserInactive] ユーザー ${userId} のドキュメントが存在しません。`);
      return false;
    }
    const userData = userSnap.data();
    if (!userData || !userData.lastActiveDate) {
      console.warn(`[isUserInactive] ユーザー ${userId} の lastActiveDate が存在しません。`);
      return false;
    }
    const lastActiveTimestamp = userData.lastActiveDate as Timestamp;
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
    throw error;
  }
};

/**
 * Firestoreから現在のユーザーデータを取得する
 * @returns {Promise<any | null>} ユーザーデータ、または存在しない場合はnull
 */
export const getUserData = async (): Promise<any | null> => { // DocumentDataの具体的な型が不明なためanyを使用
  const currentUser = auth().currentUser;
  if (!currentUser) {
    console.warn('[getUserData] ユーザーが認証されていません。');
    return null;
  }
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data();
    } else {
      console.log(`[getUserData] ユーザー ${currentUser.uid} のドキュメントが見つかりません。`);
      return null;
    }
  } catch (error) {
    console.error(`[getUserData] ユーザー ${currentUser.uid} のデータ取得エラー:`, error);
    throw error;
  }
};

/**
 * ユーザーの支払いステータスと支払いIDを取得する。
 * @returns {Promise<{ status: string | null; paymentId: string | null } | null>} 支払い情報、または取得失敗時はnull。
 */
export const getUserPaymentStatus = async (): Promise<{ status: string | null; paymentId: string | null } | null> => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    console.warn('[getUserPaymentStatus] ユーザーが認証されていません。');
    return null;
  }
  const userId = currentUser.uid;
  const userDocRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      return {
        status: data?.paymentStatus || null, // paymentStatusフィールドを想定
        paymentId: data?.paymentId || null,   // paymentIdフィールドを想定
        // paymentCompleted: data?.paymentCompleted || false, // 新しいフィールドも返す場合
      };
    } else {
      console.warn(`[getUserPaymentStatus] ユーザー ${userId} のドキュメントが見つかりません。`);
      return null; // ドキュメントがない場合は支払い情報なし
    }
  } catch (error) {
    console.error(`[getUserPaymentStatus] ユーザー ${userId} の支払いステータス取得エラー:`, error);
    throw error; // エラーを呼び出し元にスロー
  }
};

/**
 * ユーザーアカウントの存在を確認し、存在しない場合は初期ドキュメントを作成する。
 * @param uid 作成または確認するユーザーのUID。
 * @returns Promise<void>
 * @throws Firestoreのエラーが発生した場合
 */
export const ensureUserDocument = async (uid: string): Promise<void> => {
  if (!uid) {
    console.error('[ensureUserDocument] UID is undefined or null.');
    throw new Error('UIDが必要です。');
  }
  const userDocRef = doc(db, 'users', uid);
  try {
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      console.log(`[ensureUserDocument] User document for ${uid} does not exist. Creating...`);
      await setDoc(userDocRef, {
        uid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        paymentStatus: 'unpaid', // 初期支払いステータス
        lastActiveDate: serverTimestamp(), // 初期アクティブ日時
        // 新しいフロー管理フィールドの初期値
        averageUsageTimeFetched: false,
        timeLimitSet: false,
        paymentCompleted: false,
        currentLimit: null, // 目標時間
        challengeId: null, // チャレンジID
      });
      console.log(`[ensureUserDocument] User document for ${uid} created successfully.`);
    } else {
      console.log(`[ensureUserDocument] User document for ${uid} already exists.`);
      // 既存ドキュメントにもしこれらのフィールドがなければ追加する処理も検討できるが、
      // getUserFlowStatus が || false で対応しているので、必須ではない。
      // 強制的に上書きはせず、存在しない場合のみの初期化に留める。
    }
  } catch (error) {
    console.error(`[ensureUserDocument] Error ensuring user document for ${uid}:`, error);
    throw error;
  }
};

/**
 * ユーザーに関連するデータを削除する (例: チャレンジ)。
 * 注意: この関数はユーザーの認証情報 (auth) は削除しません。
 * @param userId 削除対象のユーザーID
 */
export const deleteUserRelatedData = async (userId: string): Promise<void> => {
  if (!userId) {
    throw new Error('ユーザーIDが必要です。');
  }

  const challengesRef = collection(db, 'challenges');
  // クエリを作成する代わりに、ここでは簡略化のため具体的な処理は省略
  // 実際には `where("userId", "==", userId)` のようなクエリで対象チャレンジを検索・削除する
  console.log(`[deleteUserRelatedData] ユーザー ${userId} の関連データ削除処理を開始します (現状はチャレンジのクエリ・削除は未実装)。`);

  // const q = query(challengesRef, where("userId", "==", userId));
  // const querySnapshot = await getDocs(q);
  // const deletePromises: Promise<void>[] = [];
  // querySnapshot.forEach((docSnap) => {
  //   deletePromises.push(deleteDoc(doc(db, 'challenges', docSnap.id)));
  // });
  // await Promise.all(deletePromises);
  // console.log(`ユーザー ${userId} のチャレンジデータを削除しました。`);

  // usersコレクションのドキュメント自体を削除する (オプション)
  // const userRef = doc(db, 'users', userId);
  // await deleteDoc(userRef);
  // console.log(`ユーザー ${userId} のユーザードキュメントを削除しました。`);
};

export interface UserPreferences {
  notificationsEnabled?: boolean;
  theme?: 'light' | 'dark';
}

export const updateUserPreferences = async (userId: string, preferences: UserPreferences): Promise<void> => {
  if (!userId) {
    throw new Error('ユーザーIDが必要です。');
  }
  const userDocRef = doc(db, 'users', userId);
  try {
    await updateDoc(userDocRef, {
      preferences: preferences,
      updatedAt: serverTimestamp(),
    });
    console.log(`ユーザー ${userId} の設定を更新しました。`);
  } catch (error) {
    console.error(`ユーザー ${userId} の設定更新エラー:`, error);
    throw error;
  }
};

export const getUserPreferences = async (userId: string): Promise<UserPreferences | null> => {
  if (!userId) {
    throw new Error('ユーザーIDが必要です。');
  }
  const userDocRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      return (data?.preferences as UserPreferences) || null;
    }
    return null;
  } catch (error) {
    console.error(`ユーザー ${userId} の設定取得エラー:`, error);
    throw error;
  }
};

// ユーザーの特定のフロー状態を更新する汎用関数
export const updateUserFlowStatus = async (userId: string, statusUpdates: Partial<UserFlowStatus>): Promise<void> => {
  if (!userId) {
    throw new Error('ユーザーIDが必要です。');
  }
  const userDocRef = doc(db, 'users', userId);
  try {
    await updateDoc(userDocRef, {
      ...statusUpdates,
      updatedAt: serverTimestamp(),
    });
    console.log(`[updateUserFlowStatus] User ${userId} flow status updated:`, statusUpdates);
  } catch (error) {
    console.error(`[updateUserFlowStatus] Error updating user ${userId} flow status:`, error);
    throw error;
  }
};

// 各フロー完了時に呼び出す個別の更新関数
export const markAverageUsageTimeFetched = async (userId: string): Promise<void> => {
  await updateUserFlowStatus(userId, { averageUsageTimeFetched: true });
};

export const markTimeLimitSet = async (userId: string, challengeId: string, initialLimitMinutes: number): Promise<void> => {
  // この関数はsetUserInitialTimeLimitAndCreateChallengeに統合されているので、直接は使わないかもしれないが、
  // 個別にフラグだけ更新したいケースがあれば利用
  await updateUserFlowStatus(userId, { 
    timeLimitSet: true, 
    currentChallengeId: challengeId,
    currentLimit: initialLimitMinutes
  });
};

export const markPaymentCompleted = async (userId: string): Promise<void> => {
  // 支払い情報は別途 processPayment 等で更新される想定のため、ここでは paymentCompleted フラグのみを更新
  await updateUserFlowStatus(userId, { paymentCompleted: true });

  // 既存の paymentStatus フィールドも更新する場合 (例)
  // await updateDoc(doc(db, 'users', userId), {
  //   paymentStatus: 'paid',
  //   paymentId: paymentId, // 必要であれば
  //   paymentCompleted: true, // 新しいフラグ
  //   updatedAt: serverTimestamp(),
  // });
};

/**
 * ユーザーの現在のフロー状態を取得する
 * @param userId
 * @returns {Promise<UserFlowStatus>}
 */
export const getUserFlowStatus = async (userId: string): Promise<UserFlowStatus> => {
  if (!userId) {
    throw new Error('[getUserFlowStatus] ユーザーIDが指定されていません。');
  }
  const userDocRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      console.warn(`[getUserFlowStatus] ユーザー ${userId} のドキュメントが存在しません。初期状態を返します。`);
      // ドキュメントが存在しない場合は、全フラグfalseで返す (ensureUserDocumentで作成されるはずだが念のため)
      return {
        averageUsageTimeFetched: false,
        timeLimitSet: false,
        paymentCompleted: false,
        currentChallengeId: null,
        currentLimit: null,
      };
    }
    const data = userSnap.data();
    return {
      averageUsageTimeFetched: data?.averageUsageTimeFetched || false,
      timeLimitSet: data?.timeLimitSet || (data?.currentLimit != null), // 既存のフィールドも考慮
      paymentCompleted: data?.paymentCompleted || (data?.paymentStatus === 'paid'), // 既存のフィールドも考慮
      currentChallengeId: data?.challengeId || null,
      currentLimit: data?.currentLimit || null,
    };
  } catch (error) {
    console.error(`[getUserFlowStatus] ユーザー ${userId} のフロー状態取得エラー:`, error);
    throw error;
  }
}; 