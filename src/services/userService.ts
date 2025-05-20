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
import { AppUsage } from './usageTrackingService';
import { InstalledAppInfo } from './nativeUsageStats';

// Firestoreインスタンスを一度だけ取得
const db = getFirestore();

// アプリごとの目標時間を格納する型
export interface AppUsageLimits {
  [packageName: string]: number;
}

export interface UserFlowStatus {
  averageUsageTimeFetched: boolean;
  timeLimitSet: boolean;
  paymentCompleted: boolean;
  currentChallengeId?: string | null;
  currentLimit?: number | null; // 全体の目標時間
}

export interface UserTimeSettings {
  initialDailyUsageLimit: { // ユーザーが設定した「現在の使用時間」
    total: number;
    byApp: AppUsageLimits;
  };
  targetLimit: { // ユーザーが設定した「目標時間」
    total: number;
    byApp: AppUsageLimits;
  };
}

// Firestoreの users ドキュメントの型 (部分的に定義)
interface UserDocumentData {
  initialDailyUsageLimit?: { // 追加
    total: number | null;
    byApp?: AppUsageLimits;
  };
  currentDailyUsageLimit?: { // 追加
    total: number | null;
    byApp?: AppUsageLimits;
  };
  currentLimit?: {
    total: number | null;
    byApp?: AppUsageLimits;
  };
  challengeId?: string | null;
  timeLimitSet?: boolean;
  averageUsageTimeFetched?: boolean; // getUserFlowStatusで参照するため追加
  paymentCompleted?: boolean;      // getUserFlowStatusで参照するため追加
  manuallyAddedApps?: InstalledAppInfo[]; // 手動追加されたアプリのリスト
  createdAt?: FieldValue; // setUserInitialTimeLimitAndCreateChallenge で参照するため追加
  updatedAt?: FieldValue; // 追加
  uid?: string; // ensureUserDocument で参照するため追加
  paymentStatus?: string; // ensureUserDocument で参照するため追加
  lockedApps?: string[]; // ロック対象アプリのパッケージ名リスト
}

/**
 * ユーザーの初回時間設定と新しいチャレンジの作成を行う。
 * Firestoreトランザクションを使用し、usersとchallengesコレクションへの書き込みをアトミックに行う。
 * @param userId ユーザーID
 * @param settings 設定する時間（分単位）
 * @returns 作成されたチャレンジのID
 * @throws エラーが発生した場合
 */
export const setUserInitialTimeLimitAndCreateChallenge = async (
  userId: string,
  settings: UserTimeSettings
): Promise<string> => {
  const userDocRef = doc(db, 'users', userId);
  const newChallengeRef = doc(collection(db, 'challenges')); // ID自動生成

  try {
    await runTransaction(db, async (transaction) => {
      const userDocSnap = await transaction.get(userDocRef);

      // if (userDocSnap.exists() && userDocSnap.data()?.currentLimit != null) { // 既存のロジックは一旦コメントアウト、もしくは仕様見直し
      //   throw new Error('時間設定は初回のみ可能です。');
      // }

      const userSnapData = userDocSnap.data() as UserDocumentData | undefined; //キャスト

      transaction.set(
        userDocRef,
        {
          initialDailyUsageLimit: settings.initialDailyUsageLimit, // 更新
          currentDailyUsageLimit: settings.initialDailyUsageLimit, // 更新 (初期値)
          currentLimit: settings.targetLimit, // 更新
          challengeId: newChallengeRef.id,
          timeLimitSet: true, // 目標時間設定完了フラグ
          updatedAt: serverTimestamp(),
          createdAt: userSnapData?.createdAt ?? serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(newChallengeRef, {
        userId: userId,
        initialLimitMinutes: settings.initialDailyUsageLimit.total, // 更新
        currentDailyLimitMinutes: settings.initialDailyUsageLimit.total, // 更新 (初期値)
        targetLimitMinutes: settings.targetLimit.total, // 追加
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
 * 指定されたユーザーIDのユーザードキュメントを部分的に更新する。
 * @param userId 更新対象のユーザーID
 * @param data 更新するデータ (UserDocumentData の部分集合)
 * @throws Firestoreの更新エラーが発生した場合
 */
export const updateUserDocument = async (userId: string, data: Partial<UserDocumentData>): Promise<void> => {
  if (!userId) {
    throw new Error('ユーザーIDが指定されていません。');
  }
  if (!data || Object.keys(data).length === 0) {
    console.warn('更新するデータが空です。');
    return;
  }

  const userDocRef = doc(db, 'users', userId);
  try {
    await updateDoc(userDocRef, {
      ...data,
      updatedAt: serverTimestamp(), // 常に更新日時をセット
    });
    console.log(`ユーザー (${userId}) のドキュメントを更新しました:`, data);
  } catch (error) {
    console.error(`ユーザー (${userId}) のドキュメント更新エラー:`, error);
    if (error instanceof Error) {
      throw new Error(`ユーザードキュメントの更新に失敗しました: ${error.message}`);
    }
    throw new Error('ユーザードキュメントの更新中に不明なエラーが発生しました。');
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
export const getUserData = async (): Promise<UserDocumentData | null> => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    console.warn('[getUserData] ユーザーが認証されていません。');
    return null;
  }
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data() as UserDocumentData;
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
        paymentStatus: 'pending',
        lastActiveDate: serverTimestamp(),
        averageUsageTimeFetched: false,
        timeLimitSet: false,
        paymentCompleted: false,
        initialDailyUsageLimit: { // 追加
          total: null,
          byApp: {}
        },
        currentDailyUsageLimit: { // 追加
          total: null,
          byApp: {}
        },
        currentLimit: {
          total: null,
          byApp: {}
        },
        challengeId: null,
      });
      console.log(`[ensureUserDocument] User document for ${uid} created successfully.`);
    } else {
      const data = userSnap.data() as UserDocumentData;
      // currentLimit のマイグレーション処理は新しい構造に合わせて見直し、または削除も検討
      // 今回の要件では initialDailyUsageLimit, currentDailyUsageLimit も確認・初期化が必要
      const updates: Partial<UserDocumentData> = {};
      if (!data.initialDailyUsageLimit || typeof data.initialDailyUsageLimit !== 'object' || !data.initialDailyUsageLimit.hasOwnProperty('total')) {
        updates.initialDailyUsageLimit = { total: null, byApp: {} };
      }
      if (!data.currentDailyUsageLimit || typeof data.currentDailyUsageLimit !== 'object' || !data.currentDailyUsageLimit.hasOwnProperty('total')) {
        updates.currentDailyUsageLimit = { total: null, byApp: {} };
      }
      if (!data.currentLimit || typeof data.currentLimit !== 'object' || !data.currentLimit.hasOwnProperty('total')) {
        updates.currentLimit = { total: null, byApp: {} };
      }
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(userDocRef, updates);
        console.log(`[ensureUserDocument] User document for ${uid} updated with new fields.`);
      }
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

export const markTimeLimitSet = async (userId: string, challengeId: string, settings: UserTimeSettings): Promise<void> => {
  // この関数はsetUserInitialTimeLimitAndCreateChallengeに統合されているので、直接は使わないかもしれないが、
  // 個別にフラグだけ更新したいケースがあれば利用
  await updateUserFlowStatus(userId, { 
    timeLimitSet: true, 
    currentChallengeId: challengeId,
    currentLimit: settings.targetLimit.total // UserFlowStatus.currentLimit は total のみ
  });
  // users ドキュメントの currentLimit も更新
  const userDocRef = doc(db, 'users', userId);
  await updateDoc(userDocRef, {
    currentLimit: settings.targetLimit,
    challengeId: challengeId,
    timeLimitSet: true, // updateUserFlowStatusと重複するが、明示的に設定
    updatedAt: serverTimestamp(),
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
    console.warn('[getUserFlowStatus] userId is not provided');
    // デフォルトの未完了ステータスを返すか、エラーを投げる
    return {
      averageUsageTimeFetched: false,
      timeLimitSet: false,
      paymentCompleted: false,
      currentChallengeId: null,
      currentLimit: null,
    };
  }
  const userDocRef = doc(db, 'users', userId);
  try {
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const data = userSnap.data() as UserDocumentData;
      return {
        averageUsageTimeFetched: data.averageUsageTimeFetched || false,
        timeLimitSet: data.timeLimitSet || false,
        paymentCompleted: data.paymentCompleted || false,
        currentChallengeId: data.challengeId || null,
        currentLimit: data.currentLimit?.total ?? null,
      };
    } else {
      // ユーザーが存在しない場合は、ensureUserDocument で初期化される想定
      console.warn(`[getUserFlowStatus] User document not found for ${userId}, ensureUserDocument should create it.`);
      return {
        averageUsageTimeFetched: false,
        timeLimitSet: false,
        paymentCompleted: false,
        currentChallengeId: null,
        currentLimit: null,
      };
    }
  } catch (error) {
    console.error(`[getUserFlowStatus] Error fetching user flow status for ${userId}:`, error);
    // エラー時もデフォルト値を返す
    return {
      averageUsageTimeFetched: false,
      timeLimitSet: false,
      paymentCompleted: false,
      currentChallengeId: null,
      currentLimit: null,
    };
  }
};

/**
 * ユーザーのドキュメントを取得する
 * @param userId 取得対象のユーザーID
 * @returns ユーザードキュメントのスナップショットデータ、存在しない場合はnull
 */
export const getUserDocument = async (userId: string): Promise<UserDocumentData | null> => {
  if (!userId) {
    console.warn('[getUserDocument] userId is required.');
    return null;
  }
  const userDocRef = doc(db, 'users', userId);
  try {
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserDocumentData;
    }
    return null;
  } catch (error) {
    console.error(`[getUserDocument] Error fetching user document for ${userId}:`, error);
    throw error; // or return null based on how you want to handle errors
  }
};

/**
 * ユーザーが手動で追加したアプリのリストをFirestoreに保存する
 * @param userId ユーザーID
 * @param apps 保存するアプリ情報 (アプリ名とパッケージ名) の配列
 */
export const addManuallyAddedApp = async (userId: string, apps: InstalledAppInfo[]): Promise<void> => {
  if (!userId) {
    throw new Error('ユーザーIDが必要です。');
  }
  const userDocRef = doc(db, 'users', userId);
  try {
    await updateDoc(userDocRef, {
      manuallyAddedApps: apps,
      updatedAt: serverTimestamp(),
    });
    console.log(`User ${userId}: manuallyAddedApps updated successfully.`);
  } catch (error) {
    console.error(`Failed to add manually added app for user ${userId}:`, error);
    throw error;
  }
}; 