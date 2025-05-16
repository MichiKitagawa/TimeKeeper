import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export interface PaymentData {
  userId: string;
  amount: number;
  paymentDate: FirebaseFirestoreTypes.FieldValue; //サーバータイムスタンプ用
  status: 'completed' | 'failed' | 'pending';
  transactionId?: string | null;
  createdAt: FirebaseFirestoreTypes.FieldValue;
  updatedAt: FirebaseFirestoreTypes.FieldValue;
}

const FIXED_PAYMENT_AMOUNT = 5000; // 固定利用料

/**
 * 利用料の支払い処理を行う (現在はMock処理)。
 * paymentsコレクションに記録し、usersコレクションの支払いステータスを更新する。
 * @returns 作成された支払いドキュメントのID
 * @throws エラーが発生した場合
 */
export const processPayment = async (): Promise<string> => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('ユーザーが認証されていません。ログインしてください。');
  }
  const userId = currentUser.uid;
  const paymentDocRef = firestore().collection('payments').doc(); // 新しい支払いドキュメント参照
  const userDocRef = firestore().collection('users').doc(userId);

  try {
    await firestore().runTransaction(async (transaction) => {
      // 1. paymentsコレクションに支払い記録を作成
      const paymentPayload: Omit<PaymentData, 'userId'> & { userId: string } = { // PaymentDataに合わせる
        userId: userId,
        amount: FIXED_PAYMENT_AMOUNT,
        paymentDate: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
        status: 'completed', // Mockなので即時完了
        transactionId: `mock_tx_${Date.now()}`,
        createdAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
        updatedAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
      };
      transaction.set(paymentDocRef, paymentPayload);

      // 2. usersコレクションの支払い情報を更新
      transaction.update(userDocRef, {
        paymentStatus: 'paid',
        paymentId: paymentDocRef.id,
        lastActiveDate: FirebaseFirestoreTypes.FieldValue.serverTimestamp(), // 支払い時を最終アクティブとする
        updatedAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
      });
    });
    console.log(`ユーザー ${userId} の利用料支払い処理が完了しました。PaymentID: ${paymentDocRef.id}`);
    return paymentDocRef.id;
  } catch (error) {
    console.error('利用料支払い処理エラー:', error);
    if (error instanceof Error) {
      throw new Error(`利用料の支払いに失敗しました: ${error.message}`);
    }
    throw new Error('利用料の支払い中に不明なエラーが発生しました。');
  }
}; 