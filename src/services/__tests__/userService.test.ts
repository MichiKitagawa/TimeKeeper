import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import {
  setUserInitialTimeLimitAndCreateChallenge,
  requestRefund,
  continueChallenge,
  updateLastActiveDate,
  isUserInactive,
  getUserData,
  getUserPaymentStatus,
  deleteOrAnonymizeUserData,
  UserTimeSettings,
} from '../userService';

describe('userService', () => {
  let mockAuthCurrentUser: { uid: string } | null;
  const mockUserId = 'testUserId';

  const mockFirestoreInstance = firestore();
  const mockCollection = mockFirestoreInstance.collection as jest.Mock;
  const mockDoc = mockFirestoreInstance.doc as jest.Mock;
  const mockRunTransaction = mockFirestoreInstance.runTransaction as jest.Mock;

  const mockFunctionsInstance = functions();
  const mockHttpsCallable = mockFunctionsInstance.httpsCallable as jest.Mock;
  const mockAnonymizeUserDataCallable = jest.fn().mockResolvedValue({ data: {} });

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAuthCurrentUser = { uid: mockUserId };
    (auth as jest.MockedFunction<typeof auth>).mockReturnValue({
      currentUser: mockAuthCurrentUser,
      onAuthStateChanged: jest.fn(() => jest.fn()),
      signInAnonymously: jest.fn(),
      signOut: jest.fn(),
    } as any);

    mockRunTransaction.mockImplementation(async (callback) => {
        const mockTransaction = {
            get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
            set: jest.fn().mockResolvedValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
        };
        return callback(mockTransaction);
    });

    mockHttpsCallable.mockClear();
    mockAnonymizeUserDataCallable.mockClear();
    mockHttpsCallable.mockImplementation((functionName) => {
        if (functionName === 'anonymizeUserData') {
            return mockAnonymizeUserDataCallable;
        }
        return jest.fn().mockResolvedValue({data: {}});
    });
  });

  describe('setUserInitialTimeLimitAndCreateChallenge', () => {
    const settings = { initialLimitMinutes: 60 };

    it('ユーザー未認証の場合エラーをスローする', async () => {
      (auth as jest.MockedFunction<typeof auth>).mockReturnValue({ currentUser: null } as any);
      await expect(setUserInitialTimeLimitAndCreateChallenge(settings))
        .rejects.toThrow('ユーザーが認証されていません。ログインしてください。');
    });

    it('初回設定の場合、ユーザーデータとチャレンジデータを作成する', async () => {
      const mockTransactionGet = jest.fn().mockResolvedValueOnce({ exists: false });
      const mockTransactionSet = jest.fn().mockResolvedValue(undefined);
      mockRunTransaction.mockImplementationOnce(async (cb) => cb({ get: mockTransactionGet, set: mockTransactionSet }));

      const challengeIdReturned = await setUserInitialTimeLimitAndCreateChallenge(settings);

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);

      expect(mockTransactionSet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockUserId,
          _path: `users/${mockUserId}`
        }),
        expect.objectContaining({
          currentLimit: settings.initialLimitMinutes,
          challengeId: expect.stringContaining('challenges-doc-'),
        }),
        { merge: true }
      );

      expect(mockTransactionSet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringContaining('challenges-doc-'),
          _path: expect.stringContaining('challenges/auto-id-')
        }),
        expect.objectContaining({
          userId: mockUserId,
          initialLimitMinutes: settings.initialLimitMinutes,
          status: 'active',
        })
      );
      expect(challengeIdReturned).toEqual(expect.stringContaining('challenges-doc-'));
    });

    it('既に時間設定済みの場合エラーをスローする', async () => {
      const mockTransactionGet = jest.fn().mockResolvedValueOnce({
        exists: true,
        data: () => ({ currentLimit: 30 }),
      });
      mockRunTransaction.mockImplementationOnce(async (cb) => cb({ get: mockTransactionGet, set: jest.fn() }));
      await expect(setUserInitialTimeLimitAndCreateChallenge(settings))
        .rejects.toThrow('時間設定は初回のみ可能です。');
    });

    it('Firestoreエラー時、カスタムエラーメッセージでスローする', async () => {
        mockRunTransaction.mockImplementationOnce(async () => {
            throw new Error('Firestore internal error');
        });
        await expect(setUserInitialTimeLimitAndCreateChallenge(settings))
            .rejects.toThrow('時間設定の保存に失敗しました: Firestore internal error');
    });

    it('should throw error if user has already set time limit', async () => {
      mockAuthCurrentUser = { uid: mockUserId };
      (auth as jest.MockedFunction<typeof auth>).mockReturnValue({ currentUser: mockAuthCurrentUser } as any);
      
      const mockTransactionGet = jest.fn().mockResolvedValue({ 
        exists: true,
        data: () => ({ currentLimit: 30 })
      });
      mockTransactionGet.mockResolvedValueOnce({
         exists: () => true,
         data: () => ({ currentLimit: 30 }),
      });

      mockRunTransaction.mockImplementationOnce(async (callbackWhichMayThrow) => {
        const transaction = {
          get: mockTransactionGet,
          set: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        };
        try {
          await callbackWhichMayThrow(transaction);
        } catch (error) {
          throw error; 
        }
      });

      await expect(setUserInitialTimeLimitAndCreateChallenge(settings))
        .rejects.toThrow('時間設定の保存に失敗しました: 時間設定は初回のみ可能です。');
    });

    it('should create user and challenge documents in a transaction for new user', async () => {
      mockAuthCurrentUser = { uid: mockUserId };
      (auth as jest.MockedFunction<typeof auth>).mockReturnValue({ currentUser: mockAuthCurrentUser } as any);
      const newChallengeId = 'new-challenge-123';
      let docCallCount = 0;
      (firestore as any).mocks.mockDoc.mockImplementation(() => {
          docCallCount++;
          const docId = docCallCount === 1 ? mockUserId : newChallengeId;
          return { 
            get: (firestore as any).mocks.mockGet, 
            set: (firestore as any).mocks.mockSet, 
            update: (firestore as any).mocks.mockUpdate, 
            id: docId 
          };
      });
      (firestore as any).mocks.mockGet.mockResolvedValue({ exists: () => false, data: () => null }); 
      
      (firestore as any).mocks.mockRunTransaction.mockImplementation(async (updateFunction: (transaction: any) => Promise<void>) => {
        const mockTransaction = {
          get: (docRef: any) => (firestore as any).mocks.mockGet(docRef),
          set: (firestore as any).mocks.mockSet,
          update: (firestore as any).mocks.mockUpdate,
        };
        await updateFunction(mockTransaction); 
      });

      const result = await setUserInitialTimeLimitAndCreateChallenge(settings);
      expect(result).toEqual(expect.stringContaining(newChallengeId));
    });

    it('should update existing user and create challenge documents for existing user without limit', async () => {
      mockAuthCurrentUser = { uid: mockUserId };
      (auth as jest.MockedFunction<typeof auth>).mockReturnValue({ currentUser: mockAuthCurrentUser } as any);
      const newChallengeId = 'new-challenge-456';
      let docCallCount = 0;
      (firestore as any).mocks.mockDoc.mockImplementation(() => {
        docCallCount++;
        const docId = docCallCount === 1 ? mockUserId : newChallengeId;
        return { 
            get: (firestore as any).mocks.mockGet, 
            set: (firestore as any).mocks.mockSet, 
            update: (firestore as any).mocks.mockUpdate, 
            id: docId 
          };
      });
      (firestore as any).mocks.mockGet.mockResolvedValue({ 
        exists: () => true, 
        data: () => ({ createdAt: 'some-past-date' }) 
      }); 

      (firestore as any).mocks.mockRunTransaction.mockImplementation(async (updateFunction: (transaction: any) => Promise<void>) => {
        const mockTransaction = {
          get: (docRef: any) => (firestore as any).mocks.mockGet(docRef),
          set: (firestore as any).mocks.mockSet,
          update: (firestore as any).mocks.mockUpdate,
        };
        await updateFunction(mockTransaction);
      });

      const result = await setUserInitialTimeLimitAndCreateChallenge(settings);
      expect(result).toEqual(expect.stringContaining(newChallengeId));
    });

    it('should throw error if transaction fails', async () => {
      mockAuthCurrentUser = { uid: mockUserId };
      (auth as jest.MockedFunction<typeof auth>).mockReturnValue({ currentUser: mockAuthCurrentUser } as any);
      (firestore as any).mocks.mockGet.mockResolvedValue({ exists: () => false, data: () => null }); 
      
      (firestore as any).mocks.mockRunTransaction.mockImplementation(async (updateFunction: (transaction: any) => Promise<void>) => {
        throw new Error('Transaction failed internally');
      });

      await expect(setUserInitialTimeLimitAndCreateChallenge(settings))
        .rejects.toThrow('時間設定の保存に失敗しました: Transaction failed internally');
    });
  });

  describe('requestRefund', () => {
    const challengeId = 'testChallengeId';
    const mockChallengeDocRef = { update: jest.fn().mockResolvedValue(undefined) };
    beforeEach(() => {
        (mockCollection('challenges').doc as jest.Mock).mockReturnValue(mockChallengeDocRef);
        mockChallengeDocRef.update.mockClear();
    });

    it('ユーザーIDがない場合エラーをスロー', async () => {
        await expect(requestRefund('', challengeId)).rejects.toThrow('ユーザーIDまたはチャレンジIDが必要です。');
    });

    it('チャレンジIDがない場合エラーをスロー', async () => {
        await expect(requestRefund(mockUserId, '')).rejects.toThrow('ユーザーIDまたはチャレンジIDが必要です。');
    });

    it('チャレンジステータスをcompleted_refundに更新する', async () => {
      await requestRefund(mockUserId, challengeId);
      expect(mockCollection('challenges').doc).toHaveBeenCalledWith(challengeId);
      expect(mockChallengeDocRef.update).toHaveBeenCalledWith({
        status: 'completed_refund',
        endDate: firestore.FieldValue.serverTimestamp(),
      });
    });
  });

  describe('continueChallenge', () => {
    const challengeId = 'testChallengeIdContinue';
    const mockChallengeDocRef = { update: jest.fn().mockResolvedValue(undefined) };
    beforeEach(() => {
        (mockCollection('challenges').doc as jest.Mock).mockReturnValue(mockChallengeDocRef);
        mockChallengeDocRef.update.mockClear();
    });

    it('ユーザーIDがない場合エラーをスロー', async () => {
        await expect(continueChallenge('', challengeId)).rejects.toThrow('ユーザーIDまたはチャレンジIDが必要です。');
    });

    it('チャレンジIDがない場合エラーをスロー', async () => {
        await expect(continueChallenge(mockUserId, '')).rejects.toThrow('ユーザーIDまたはチャレンジIDが必要です。');
    });

    it('チャレンジステータスをcompleted_continueに更新する', async () => {
      await continueChallenge(mockUserId, challengeId);
      expect(mockCollection('challenges').doc).toHaveBeenCalledWith(challengeId);
      expect(mockChallengeDocRef.update).toHaveBeenCalledWith({
        status: 'completed_continue',
      });
    });
  });

  describe('updateLastActiveDate', () => {
    const mockUserDocRef = { update: jest.fn().mockResolvedValue(undefined), id: mockUserId };
    beforeEach(() => {
        (mockCollection('users').doc as jest.Mock).mockImplementation((userId) => {
            if (userId === mockUserId) return mockUserDocRef;
            return { update: jest.fn().mockResolvedValue(undefined), id: userId };
        });
        mockUserDocRef.update.mockClear();
    });

    it('ユーザー未認証の場合、警告ログを出し、更新しない', async () => {
      console.warn = jest.fn();
      (auth as jest.MockedFunction<typeof auth>).mockReturnValue({ currentUser: null } as any); 
      await updateLastActiveDate();
      expect(mockUserDocRef.update).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('[updateLastActiveDate] ユーザーが認証されていません。');
    });

    it('認証済みユーザーのlastActiveDateを更新する', async () => {
      await updateLastActiveDate();
      expect(mockCollection('users').doc).toHaveBeenCalledWith(mockUserId);
      expect(mockUserDocRef.update).toHaveBeenCalledWith({
        lastActiveDate: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    });
  });

  describe('isUserInactive', () => {
    const mockUserDocRef = { get: jest.fn(), id: mockUserId };
    beforeEach(() => {
        (mockCollection('users').doc as jest.Mock).mockImplementation(uid => {
            if (uid === mockUserId) return mockUserDocRef;
            return { get: jest.fn().mockResolvedValue({exists: false}), id: uid }; 
        });
        mockUserDocRef.get.mockClear();
    });

    it('ユーザー未認証の場合エラーをスローする', async () => {
      (auth as jest.MockedFunction<typeof auth>).mockReturnValue({ currentUser: null } as any); 
      await expect(isUserInactive()).rejects.toThrow('[isUserInactive] ユーザーが認証されていません。');
    });

    it('ユーザーデータが存在しない場合falseを返す（userService.tsの実装変更による）', async () => {
      mockUserDocRef.get.mockResolvedValueOnce({ exists: false });
      const inactive = await isUserInactive();
      expect(inactive).toBe(false);
    });

    it('lastActiveDateがない場合、falseを返す（userService.tsの実装変更による）', async () => {
        mockUserDocRef.get.mockResolvedValueOnce({ exists: true, data: () => ({}) });
        const inactive = await isUserInactive();
        expect(inactive).toBe(false);
    });
    
    it('lastActiveDateが閾値より古い場合、非アクティブと判定する', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      mockUserDocRef.get.mockResolvedValueOnce({ 
        exists: true, 
        data: () => ({ lastActiveDate: firestore.Timestamp.fromDate(oldDate) })
      });
      const inactive = await isUserInactive(7);
      expect(inactive).toBe(true);
    });

    it('lastActiveDateが閾値以内の場合、アクティブと判定する', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3);
      mockUserDocRef.get.mockResolvedValueOnce({ 
        exists: true, 
        data: () => ({ lastActiveDate: firestore.Timestamp.fromDate(recentDate) })
      });
      const inactive = await isUserInactive(7);
      expect(inactive).toBe(false);
    });
  });

  describe('getUserData', () => {
    const mockUserDocRef = { get: jest.fn(), id: mockUserId };
    beforeEach(() => {
        (mockCollection('users').doc as jest.Mock).mockImplementation(uid => {
            if (uid === mockUserId) return mockUserDocRef;
            return { get: jest.fn().mockResolvedValue({exists: false}), id: uid }; 
        });
        mockUserDocRef.get.mockClear();
    });

    it('ユーザー未認証の場合nullを返す', async () => {
        (auth as jest.MockedFunction<typeof auth>).mockReturnValue({ currentUser: null } as any); 
        const userData = await getUserData();
        expect(userData).toBeNull();
    });

    it('ユーザーデータが存在しない場合nullを返す', async () => {
      mockUserDocRef.get.mockResolvedValueOnce({ exists: false });
      const userData = await getUserData();
      expect(userData).toBeNull();
    });

    it('ユーザーデータが存在する場合、データを返す', async () => {
      const mockData = { name: 'Test User', email: 'test@example.com' };
      mockUserDocRef.get.mockResolvedValueOnce({ exists: true, data: () => mockData });
      const userData = await getUserData();
      expect(userData).toEqual(mockData);
    });
  });

  describe('getUserPaymentStatus', () => {
    const mockUserDocRef = { get: jest.fn(), id: mockUserId };
    beforeEach(() => {
        (mockCollection('users').doc as jest.Mock).mockImplementation(uid => {
            if (uid === mockUserId) return mockUserDocRef;
            return { get: jest.fn().mockResolvedValue({exists: false}), id: uid }; 
        });
        mockUserDocRef.get.mockClear();
    });

    it('ユーザー未認証の場合nullを返す（userService.tsの実装はエラーをスロー）', async () => {
        (auth as jest.MockedFunction<typeof auth>).mockReturnValue({ currentUser: null } as any); 
        await expect(getUserPaymentStatus()).rejects.toThrow('[getUserPaymentStatus] ユーザーが認証されていません。');
    });

    it('ユーザーデータがない場合nullを返す', async () => {
        mockUserDocRef.get.mockResolvedValueOnce({ exists: false }); 
        const status = await getUserPaymentStatus();
        expect(status).toBeNull();
    });

    it('ユーザーデータにpaymentStatusがない場合、null値を持つオブジェクトを返す', async () => {
        mockUserDocRef.get.mockResolvedValueOnce({ exists: true, data: () => ({}) });
        const status = await getUserPaymentStatus();
        expect(status).toEqual({ status: null, paymentId: null });
    });

    it('ユーザーデータにpaymentStatusがある場合、その値を返す', async () => {
        const paymentData = { paymentStatus: 'paid', paymentId: 'pid123' };
        mockUserDocRef.get.mockResolvedValueOnce({ exists: true, data: () => paymentData });
        const status = await getUserPaymentStatus();
        expect(status).toEqual({ status: 'paid', paymentId: 'pid123' });
    });
  });

  describe('deleteOrAnonymizeUserData', () => {
    it('userId引数がない場合エラーをスローする', async () => {
        await expect(deleteOrAnonymizeUserData(undefined as any)).rejects.toThrow('ユーザーIDが必要です。');
    });

    it('functionsのanonymizeUserDataが呼び出される', async () => {
        (auth as jest.MockedFunction<typeof auth>).mockReturnValue({
             currentUser: { uid: mockUserId } 
        } as any);
        
        await deleteOrAnonymizeUserData(mockUserId);
        expect(mockHttpsCallable).toHaveBeenCalledWith('anonymizeUserData');
        expect(mockAnonymizeUserDataCallable).toHaveBeenCalled();
    });

    it('functions呼び出しでエラーが発生しても、エラーをスローしない（ログは出る）', async () => {
        (auth as jest.MockedFunction<typeof auth>).mockReturnValue({
             currentUser: { uid: mockUserId } 
        } as any);
        mockAnonymizeUserDataCallable.mockRejectedValueOnce(new Error('Function error'));
        console.error = jest.fn(); 

        await expect(deleteOrAnonymizeUserData(mockUserId)).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalledWith(`ユーザー ${mockUserId} のデータ削除/匿名化処理中にエラー:`, expect.any(Error));
    });
  });
}); 