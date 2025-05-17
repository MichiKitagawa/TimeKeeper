import {
  getFirestore,
  runTransaction,
  collection,
  doc,
  serverTimestamp,
  FieldValue,
  FirebaseFirestoreTypes, // DocumentDataの代わりにFirebaseFirestoreTypesをインポート
} from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export interface PaymentData {
  userId: string;
  amount: number;
  paymentDate: FieldValue; //サーバータイムスタンプ用
  status: 'completed' | 'failed' | 'pending';
  transactionId?: string | null;
  createdAt: FieldValue;
  updatedAt: FieldValue;
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
  const db = getFirestore(); // Firestoreインスタンスを取得

  try {
    const paymentId = await runTransaction(db, async (transaction) => { // dbを第一引数に
      const paymentCollectionRef = collection(db, 'payments');
      const paymentDocRef = doc(paymentCollectionRef); // ID自動生成で新しいドキュメント参照を作成
      const userDocRef = doc(db, 'users', userId);

      const fixedPaymentAmount = 5000;
      const transactionId = `mock_tx_${Date.now()}`;

      const paymentPayload: PaymentData = { // PaymentData型を明示的に使用
        userId: userId,
        amount: fixedPaymentAmount,
        paymentDate: serverTimestamp(),
        status: 'completed',
        transactionId: transactionId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      transaction.set(paymentDocRef, paymentPayload as FirebaseFirestoreTypes.DocumentData); // DocumentDataをFirebaseFirestoreTypes経由で参照

      const userUpdatePayload = {
        paymentStatus: 'paid',
        paymentId: paymentDocRef.id,
        paymentCompleted: true,
        lastActiveDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      transaction.update(userDocRef, userUpdatePayload);
      
      return paymentDocRef.id;
    });

    console.log(`ユーザー ${userId} の利用料支払い処理が完了しました。PaymentID: ${paymentId}`);
    return paymentId!; // runTransactionが成功すればundefinedにはならない想定

  } catch (error) {
    console.error('利用料支払い処理エラー:', error);
    if (error instanceof Error) {
      throw new Error(`利用料の支払いに失敗しました: ${error.message}`);
    }
    throw new Error('利用料の支払い中に不明なエラーが発生しました。');
  }
}; 