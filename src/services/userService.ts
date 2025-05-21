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
  query,
  where,
  getDocs,
  deleteDoc,
} from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import { AppUsage } from './usageTrackingService';
import { InstalledAppInfo } from './nativeUsageStats';

// Firestoreインスタンスを一度だけ取得
const db = getFirestore();
const auth = getAuth();

// アプリごとの目標時間を格納する型
export interface AppUsageLimits {
  [packageName: string]: number;
}

export interface UserFlowStatus {
  timeLimitSet: boolean;
  paymentCompleted: boolean;
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
  lockedApps?: string[];
  appNameMap?: { [packageName: string]: string }; // アプリ名とパッケージ名のマッピング
}

// Firestoreの users ドキュメントの型 (部分的に定義)
interface UserDocumentData {
  initialDailyUsageLimit?: {
    total: number | null;
    byApp?: AppUsageLimits;
  };
  currentDailyUsageLimit?: {
    total: number | null;
    byApp?: AppUsageLimits;
  };
  currentLimit?: {
    total: number | null;
    byApp?: AppUsageLimits;
  };
  timeLimitSet?: boolean;
  paymentCompleted?: boolean;
  manuallyAddedApps?: InstalledAppInfo[];
  createdAt?: FieldValue;
  updatedAt?: FieldValue;
  uid?: string;
  paymentStatus?: string;
  lockedApps?: string[];
  appNameMap?: { [packageName: string]: string };
  lastActiveDate?: FieldValue;
  paymentId?: string; // getUserPaymentStatusで参照
}

/**
 * ユーザーの時間設定を保存する。
 * usersコレクションへの書き込みを行う。
 * @param userId ユーザーID
 * @param settings 設定する時間（分単位）とロック対象アプリ、アプリ名マップ
 * @throws エラーが発生した場合
 */
export const setUserTimeSettings = async (
  userId: string,
  settings: UserTimeSettings
): Promise<void> => {
  const userDocRef = doc(db, 'users', userId);

  console.log('[userService] setUserTimeSettings - received settings:', JSON.stringify(settings, null, 2));

  try {
    const updateData: Partial<UserDocumentData> = {
      initialDailyUsageLimit: settings.initialDailyUsageLimit,
      currentLimit: settings.targetLimit,
      currentDailyUsageLimit: settings.targetLimit, // 目標時間＝その日の許容時間とする
      timeLimitSet: true,
      updatedAt: serverTimestamp(),
    };

    if (settings.lockedApps) {
      updateData.lockedApps = settings.lockedApps;
    }
    if (settings.appNameMap) { // アプリ名マップを保存
      updateData.appNameMap = settings.appNameMap;
    }

    console.log('[userService] setUserTimeSettings - updateData before transaction:', JSON.stringify(updateData, null, 2));

    await setDoc(userDocRef, 
      { 
        ...updateData, 
        // createdAt は ensureUserDocument で設定されるため、ここでは通常更新しない
        // もし未設定の場合のみ設定するロジックが必要なら別途追加
      }, 
      { merge: true } // 既存のフィールドを保持しつつ更新
    );
    console.log(`ユーザー (${userId}) の時間設定を保存しました。`);
  } catch (error) {
    console.error('時間設定エラー:', error);
    if (error instanceof Error) {
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
 * ユーザーのドキュメントを取得する
 * @param userId 取得対象のユーザーID
 * @returns ユーザードキュメントのスナップショットデータ、存在しない場合はnull
 */
export const getUserData = async (): Promise<UserDocumentData | null> => {
  const currentUser = auth.currentUser;
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
  const currentUser = auth.currentUser;
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
 * 指定されたUIDのユーザードキュメントが存在することを確認し、なければ初期作成する。
 * @param uid 確認・作成対象のユーザーID
 */
export const ensureUserDocument = async (uid: string): Promise<void> => {
  if (!uid) {
    console.warn('[ensureUserDocument] uidが指定されていません。処理をスキップします。');
    return;
  }
  const userDocRef = doc(db, 'users', uid);
  try {
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      console.log(`ユーザー (${uid}) のドキュメントが存在しないため、新規作成します。`);
      const currentUser = auth.currentUser;
      await setDoc(userDocRef, {
        uid: uid,
        email: currentUser?.email || '', // Firestoreに保存するemail
        displayName: currentUser?.displayName || '', // Firestoreに保存するdisplayName
        timeLimitSet: false,
        paymentCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastActiveDate: serverTimestamp(),
        paymentStatus: 'pending', // 初期ステータス
        manuallyAddedApps: [],      // 初期状態は空配列
        lockedApps: [],             // 初期状態は空配列
        appNameMap: {},             // 初期状態は空オブジェクト
        // 初期利用時間と目標時間はTimeSettingScreenで設定される想定
      });
      console.log(`ユーザー (${uid}) のドキュメントを新規作成しました。`);
    } else {
      // ドキュメントが存在する場合でもlastActiveDateを更新する (ensureのタイミングでアクティブとみなす)
      await updateDoc(userDocRef, { updatedAt: serverTimestamp(), lastActiveDate: serverTimestamp() });
    }
  } catch (error) {
    console.error(`ユーザー (${uid}) のドキュメント確認/作成エラー:`, error);
    if (error instanceof Error) {
      throw new Error(`ユーザードキュメントの確認/作成に失敗しました: ${error.message}`);
    }
    throw new Error('ユーザードキュメントの確認/作成中に不明なエラーが発生しました。');
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
  if (!userId) throw new Error("ユーザーIDが必要です。");
  await updateUserDocument(userId, statusUpdates as Partial<UserDocumentData>); //キャストが必要になる場合
};

export const markAverageUsageTimeFetched = async (userId: string): Promise<void> => {
  console.log("markAverageUsageTimeFetched is deprecated and fully removed.");
};

export const markTimeLimitSet = async (userId: string /*, settings: UserTimeSettings*/): Promise<void> => {
  // setUserTimeSettings が timeLimitSet: true を設定するため、この関数は基本的には不要
  // 個別に timeLimitSet のみを更新したい特殊なケースがあれば残すが、通常は updateUserFlowStatus を使うか、
  // setUserTimeSettings の一部として扱われるべき。
  await updateUserDocument(userId, { timeLimitSet: true }); 
  console.log("markTimeLimitSet called, but prefer using setUserTimeSettings or updateUserFlowStatus.");
};

export const markPaymentCompleted = async (userId: string): Promise<void> => {
  await updateUserDocument(userId, { paymentCompleted: true, paymentStatus: 'paid' });
};

export const getUserFlowStatus = async (userId: string): Promise<UserFlowStatus> => {
  const userDoc = await getUserDocument(userId);
  if (!userDoc) {
    // ユーザーが存在しない場合はデフォルトの未完了ステータスを返すか、エラーを投げる
    // ここではensureUserDocumentが呼ばれている前提で、ドキュメントは存在すると考える
    // ただし、万が一存在しない場合のエラーハンドリングは別途検討
    console.error(`User document not found for ID: ${userId} in getUserFlowStatus. This should not happen if ensureUserDocument was called.`);
    return {
      timeLimitSet: false,
      paymentCompleted: false,
    };
  }

  // currentLimit.total の値がnullまたは0でないことを確認して challengeLimitSet を判定していたが、
  // timeLimitSet フラグを直接使用するように変更。
  return {
    timeLimitSet: userDoc.timeLimitSet === true,
    paymentCompleted: userDoc.paymentCompleted === true,
  };
};

/**
 * ユーザーのドキュメントを取得する
 * @param userId 取得対象のユーザーID
 * @returns ユーザードキュメントのスナップショットデータ、存在しない場合はnull
 */
export const getUserDocument = async (userId: string): Promise<UserDocumentData | null> => {
  if (!userId) {
    console.warn('getUserDocument called with no userId');
    return null;
  }
  const userDocRef = doc(db, 'users', userId);
  const userDocSnap = await getDoc(userDocRef);

  if (userDocSnap.exists()) {
    return userDocSnap.data() as UserDocumentData;
  } else {
    return null;
  }
};

/**
 * ユーザーが手動で追加したアプリのリストをFirestoreに保存/更新する。
 * 既存のリストを完全に置き換える。
 * @param userId 対象のユーザーID
 * @param apps 保存するアプリ情報の配列 (アプリ名とパッケージ名を含むオブジェクトの配列)
 */
export const addManuallyAddedApp = async (userId: string, apps: InstalledAppInfo[]): Promise<void> => {
  if (!userId) {
    throw new Error('ユーザーIDが指定されていません。');
  }
  // apps 配列が空でも、空のリストで上書きする（全て解除された場合など）
  await updateUserDocument(userId, { manuallyAddedApps: apps });
  console.log(`ユーザー (${userId}) の手動追加アプリリストを更新しました:`, apps);
};

/**
 * ユーザーのロック対象アプリリストを更新する
 * @param userId
 * @param lockedAppPackages パッケージ名の配列
 */
export const updateUserLockedApps = async (userId: string, lockedAppPackages: string[]): Promise<void> => {
  if (!userId) {
    throw new Error('ユーザーIDが指定されていません。');
  }
  await updateUserDocument(userId, { lockedApps: lockedAppPackages });
  console.log(`ユーザー (${userId}) のロック対象アプリを更新しました:`, lockedAppPackages);
}

/**
 * ユーザーのアプリ名マップを更新する
 * @param userId
 * @param appNameMap {packageName: appName} の形式のオブジェクト
 */
export const updateAppNameMap = async (userId: string, appNameMap: { [packageName: string]: string }): Promise<void> => {
  if (!userId) {
    throw new Error('ユーザーIDが指定されていません。');
  }
  await updateUserDocument(userId, { appNameMap });
  console.log(`ユーザー (${userId}) のアプリ名マップを更新しました:`, appNameMap);
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
  const userDoc = await getUserDocument(userId);
  if (!userDoc || !userDoc.lastActiveDate) {
    console.warn(`[isUserInactive] ユーザー ${userId} のドキュメントまたはlastActiveDateが存在しません。`);
    return false; // アクティブではない、または判定不能
  }
  const lastActiveTimestamp = userDoc.lastActiveDate as Timestamp;
  const lastActiveDateTime = lastActiveTimestamp.toDate();
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - lastActiveDateTime.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays > inactiveThresholdDays;
};

export const updateLastActiveDate = async (): Promise<void> => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn('[updateLastActiveDate] ユーザーが認証されていません。最終アクティブ日時を更新できません。');
    return;
  }
  const userId = currentUser.uid;
  try {
    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
      lastActiveDate: serverTimestamp(),
      updatedAt: serverTimestamp() // updatedAtも併せて更新
    });
    console.log(`[updateLastActiveDate] ユーザー ${userId} の最終アクティブ日時を更新しました。`);
  } catch (error) {
    console.error(`[updateLastActiveDate] ユーザー ${userId} の最終アクティブ日時更新エラー:`, error);
    // ここではエラーをスローせず、コンソール出力に留める (影響範囲を限定するため)
  }
};

export const deleteOrAnonymizeUserData = async (userId: string): Promise<void> => {
  const batch = getFirestore().batch();

  const collectionsToDelete = ['usageLogs', 'payments']; // 'unlockLogs' などもあれば追加
  for (const collectionName of collectionsToDelete) {
    const collectionRef = collection(db, collectionName);
    const q = query(collectionRef, where('userId', '==', userId));
    try {
      const docsSnapshot = await getDocs(q);
      docsSnapshot.forEach(doc => batch.delete(doc.ref));
    } catch (error) {
      console.error(`Error preparing to delete documents from ${collectionName} for user ${userId}:`, error);
    }
  }

  const userDocRef = doc(db, 'users', userId);
  batch.delete(userDocRef);

  try {
    await batch.commit();
    console.log(`ユーザー (${userId}) の関連データ削除が完了しました。`);
  } catch (error) {
    console.error(`ユーザー (${userId}) のデータ削除処理中にエラー:`, error);
    throw error;
  }
}; 