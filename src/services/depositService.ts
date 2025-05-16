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
  if (!currentUser || !currentUser.uid) {
    throw new Error('ユーザーが認証されていません。ログインしてください。');
  }
  const userId = currentUser.uid;

  try {
    const paymentId = await firestore().runTransaction(async (transaction) => {
      const paymentDocRef = firestore().collection('payments').doc(); 
      const userDocRef = firestore().collection('users').doc(userId);

      const fixedPaymentAmount = 5000;
      const transactionId = `mock_tx_${Date.now()}`;

      const paymentPayload = {
        id: paymentDocRef.id, 
        userId: userId,
        amount: fixedPaymentAmount,
        paymentDate: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
        status: 'completed', 
        transactionId: transactionId, 
        createdAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
        updatedAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
      };
      transaction.set(paymentDocRef, paymentPayload as FirebaseFirestoreTypes.DocumentData);

      const userUpdatePayload = {
        paymentStatus: 'paid',
        paymentId: paymentDocRef.id,
        lastActiveDate: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
        updatedAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
      };
      transaction.update(userDocRef, userUpdatePayload);
      
      return paymentDocRef.id;
    });

    console.log(`ユーザー ${userId} の利用料支払い処理が完了しました。PaymentID: ${paymentId}`);
    return paymentId; 

  } catch (error) {
    console.error('利用料支払い処理エラー:', error);
    if (error instanceof Error) {
      throw new Error(`利用料の支払いに失敗しました: ${error.message}`);
    }
    throw new Error('利用料の支払い中に不明なエラーが発生しました。');
  }
}; 