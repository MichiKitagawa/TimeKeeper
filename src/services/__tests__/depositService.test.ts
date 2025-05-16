import { processPayment, PaymentData } from '../depositService';
import auth from '@react-native-firebase/auth';
// firestore の import はモックされるので、型としてのみ利用
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import firestore, { FirebaseFirestoreTypes as FirestoreFirebaseFirestoreTypes } from '@react-native-firebase/firestore';

// --- Global Mock Variables ---
const mockUserId = 'testUser123';
let mockPaymentDocId: string;

// --- Firebase Auth Mock ---
const mockCurrentUser = jest.fn();
jest.mock('@react-native-firebase/auth', () => {
  return () => ({
    currentUser: mockCurrentUser(),
  });
});

// --- Test-file-scope Firestore Mock Functions ---
const mockFirestoreDocumentSet = jest.fn(() => Promise.resolve());
const mockFirestoreDocumentUpdate = jest.fn(() => Promise.resolve());
const mockFirestoreCollectionDoc = jest.fn((docId?: string) => ({
  id: docId || `mockPaymentId_${Date.now()}`,
  set: mockFirestoreDocumentSet,
  update: mockFirestoreDocumentUpdate,
}));
const mockFirestoreCollection = jest.fn(() => ({
  doc: mockFirestoreCollectionDoc,
}));
const mockRunTransactionUpdateFunctionSet = jest.fn(() => Promise.resolve());
const mockRunTransactionUpdateFunctionUpdate = jest.fn(() => Promise.resolve());
const mockRunTransaction = jest.fn(async (updateFunction) => {
  const transaction = {
    set: mockRunTransactionUpdateFunctionSet,
    update: mockRunTransactionUpdateFunctionUpdate,
  };
  try {
    const result = await updateFunction(transaction);
    return Promise.resolve(result);
  } catch (error) {
    return Promise.reject(error);
  }
});
const plainServerTimestampFn = () => 'mockServerTimestampVal' as any;

jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  default: {
    apps: [],
    initializeApp: jest.fn(),
  },
}));

jest.mock('@react-native-firebase/firestore', () => {
  // firestore() の呼び出し自体が、collection メソッドなどを持つオブジェクトを返す
  const firestoreMock = jest.fn(() => ({
    collection: mockFirestoreCollection,    
    runTransaction: mockRunTransaction, 
  }));

  // firestore.FieldValue のような静的アクセスをモック
  (firestoreMock as any).FieldValue = {
    serverTimestamp: plainServerTimestampFn,
  };

  const MockedFirebaseFirestoreTypes = {
    FieldValue: { 
      serverTimestamp: plainServerTimestampFn,
    },
  };

  return {
    __esModule: true,
    default: firestoreMock, 
    FirebaseFirestoreTypes: MockedFirebaseFirestoreTypes,
  };
});

describe('depositService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockReturnValue({ uid: mockUserId });
    mockPaymentDocId = `mockPaymentId_${Date.now()}`;
    mockFirestoreCollectionDoc.mockReturnValue({
      id: mockPaymentDocId,
      set: mockFirestoreDocumentSet,
      update: mockFirestoreDocumentUpdate,
    });
  });

  it('支払い処理が成功し、正しいデータでFirestoreが更新される', async () => {
    const paymentId = await processPayment();
    expect(paymentId).toBe(mockPaymentDocId);
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockFirestoreCollection).toHaveBeenCalledWith('payments');
    expect(mockRunTransactionUpdateFunctionSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: mockPaymentDocId }),
      expect.objectContaining({
        userId: mockUserId,
        amount: 5000,
        status: 'completed',
        paymentDate: 'mockServerTimestampVal',
        createdAt: 'mockServerTimestampVal',
        updatedAt: 'mockServerTimestampVal',
        transactionId: expect.stringMatching(/^mock_tx_/),
      })
    );
    expect(mockFirestoreCollection).toHaveBeenCalledWith('users');
    expect(mockRunTransactionUpdateFunctionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: mockUserId }), // userDocRef is mocked to return this id
      expect.objectContaining({
        paymentStatus: 'paid',
        paymentId: mockPaymentDocId,
        lastActiveDate: 'mockServerTimestampVal',
        updatedAt: 'mockServerTimestampVal',
      })
    );
    expect(mockFirestoreCollectionDoc).toHaveBeenCalledWith(); // For payments collection, doc() is called without args
    expect(mockFirestoreCollectionDoc).toHaveBeenCalledWith(mockUserId); // For users collection, doc(userId) is called
  });

  it('Firestoreのトランザクション内の set でエラーが発生した場合、エラーをスローする', async () => {
    mockRunTransactionUpdateFunctionSet.mockImplementationOnce(() => 
      Promise.reject(new Error('Firestore set failed'))
    );
    // エラーメッセージの完全一致ではなく、何らかのエラーがスローされることだけを確認
    await expect(processPayment()).rejects.toThrow(); 
  });

  it('Firestoreのトランザクション内の update でエラーが発生した場合、エラーをスローする', async () => {
    mockRunTransactionUpdateFunctionUpdate.mockImplementationOnce(() => 
      Promise.reject(new Error('Firestore update failed'))
    );
    await expect(processPayment()).rejects.toThrow();
  });

  it('Firestoreのトランザクション自体でエラーが発生した場合、エラーをスローする', async () => {
    mockRunTransaction.mockImplementationOnce(async () => {
      throw new Error('Firestore transaction failed');
    });
    await expect(processPayment()).rejects.toThrow('利用料の支払いに失敗しました: Firestore transaction failed');
  });

  it('ユーザーが認証されていない場合、エラーをスローする', async () => {
    mockCurrentUser.mockReturnValue(undefined);
    await expect(processPayment()).rejects.toThrow('ユーザーが認証されていません。ログインしてください。');
  });

  it('auth().currentUser が null の場合でもエラーをスローする', async () => {
    mockCurrentUser.mockReturnValue(null); 
    await expect(processPayment()).rejects.toThrow('ユーザーが認証されていません。ログインしてください。');
  });
}); 