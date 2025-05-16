import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export interface DepositData {
  refundAmount: number;
  feeRate: number;
  chargedAmount: number;
  // transactionId?: string; // 将来的に使用する場合
}

export const saveDeposit = async (data: DepositData): Promise<string> => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('ユーザーが認証されていません。ログインしてください。');
  }

  const depositPayload = {
    userId: currentUser.uid,
    refundAmount: data.refundAmount,
    feeRate: data.feeRate,
    chargedAmount: data.chargedAmount,
    status: 'pending' as const, // Firestoreのセキュリティルールに合わせる
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
    transactionId: null, // 初期値はnull。将来的に決済IDなどを格納
  };

  try {
    const docRef = await firestore().collection('deposits').add(depositPayload);
    return docRef.id; // 保存されたドキュメントのIDを返す
  } catch (error) {
    console.error('Firestoreへの頭金データ保存エラー:', error);
    // エラーを詳細にログ出力するか、エラー種別に応じてハンドリング
    if (error instanceof Error) {
      throw new Error(`頭金の登録に失敗しました: ${error.message}`);
    }
    throw new Error('頭金の登録中に不明なエラーが発生しました。');
  }
}; 