import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getLatestUnlockLog, calculateUnlockDetails, processUnlock, UnlockLogData } from '../unlockService';

// firestore のモック
jest.mock('@react-native-firebase/firestore', () => {
  const mockCollection = jest.fn();
  const mockWhere = jest.fn();
  const mockOrderBy = jest.fn();
  const mockLimit = jest.fn();
  const mockGet = jest.fn();
  const mockAdd = jest.fn();
  const mockUpdate = jest.fn(); // processUnlock で使用
  const mockDoc = jest.fn(); // processUnlock で使用

  // チェーン可能なモックのセットアップ
  const chainableMock = {
    collection: mockCollection,
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    get: mockGet,
    add: mockAdd,
    doc: mockDoc, // doc().update() のために追加
    update: mockUpdate // ref.update() のために追加 (doc の結果として返される ref オブジェクトが持つ)
  };

  mockCollection.mockReturnValue(chainableMock);
  mockWhere.mockReturnValue(chainableMock); // where().where() や where().orderBy() のために自身を返す
  mockOrderBy.mockReturnValue(chainableMock); // orderBy().limit() のために自身を返す
  mockLimit.mockReturnValue(chainableMock); // limit().get() のために自身を返す
  mockDoc.mockReturnValue(chainableMock); // doc().update() のために自身を返す

  const mockFirestore = () => ({
    collection: mockCollection,
    doc: mockDoc, // firestore().doc() の呼び出しに対応
    Timestamp: {
      now: jest.fn(() => ({
        toDate: () => new Date(),
        // FirestoreのTimestampインスタンスが持つ他のメソッド/プロパティも必要に応じてモック
      }) as unknown as FirebaseFirestoreTypes.Timestamp),
      fromDate: jest.fn((date: Date) => ({
        toDate: () => date,
      }) as unknown as FirebaseFirestoreTypes.Timestamp),
    },
  });

  // モックされた関数をリセットするヘルパーと、モックへのアクセス
  (mockFirestore as any).mockClear = () => {
    mockCollection.mockClear();
    mockWhere.mockClear();
    mockOrderBy.mockClear();
    mockLimit.mockClear();
    mockGet.mockClear();
    mockAdd.mockClear();
    mockUpdate.mockClear();
    mockDoc.mockClear();
    // Timestampのモックは振る舞いが固定なのでリセット不要
  };

  (mockFirestore as any).mocks = {
    mockCollection,
    mockWhere,
    mockOrderBy,
    mockLimit,
    mockGet,
    mockAdd,
    mockUpdate,
    mockDoc,
  };

  return mockFirestore;
});

const mockFirestoreInstance = firestore as jest.MockedFunction<any>; // anyでキャスト

describe('unlockService', () => {
  beforeEach(() => {
    // 各テストの前に firestore のモックをリセット
    if ((firestore as any).mockClear) {
      (firestore as any).mockClear();
    }
    // jest.fn() で作られたモックのリセット
    Object.values((firestore as any).mocks).forEach(mockFn => (mockFn as jest.Mock).mockClear());
  });

  describe('getLatestUnlockLog', () => {
    const userId = 'test-user-id';

    it('should return null if no unlock logs exist', async () => {
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const result = await getLatestUnlockLog(userId);
      expect(result).toBeNull();
      expect((firestore as any).mocks.mockCollection).toHaveBeenCalledWith('unlockLogs');
      expect((firestore as any).mocks.mockWhere).toHaveBeenCalledWith('userId', '==', userId);
      expect((firestore as any).mocks.mockOrderBy).toHaveBeenCalledWith('date', 'desc');
      expect((firestore as any).mocks.mockLimit).toHaveBeenCalledWith(1);
    });

    it('should return the latest unlock log if logs exist', async () => {
      const mockDate = new Date();
      const mockLogData = {
        userId,
        // FirestoreのTimestamp型を模倣。 실제로는 toDate() メソッドなどを持つオブジェクト
        date: { toDate: () => mockDate } as FirebaseFirestoreTypes.Timestamp,
        unlockFee: 200,
        previousMultiplier: 1,
        newMultiplier: 1.2,
      } as UnlockLogData;

      (firestore as any).mocks.mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => mockLogData }],
      });

      const result = await getLatestUnlockLog(userId);
      expect(result).toEqual(mockLogData);
      expect(result?.date.toDate()).toEqual(mockDate); // Timestampの検証
    });

    it('should throw an error if firestore throws an error', async () => {
      const errorMessage = 'Firestore error';
      (firestore as any).mocks.mockGet.mockRejectedValueOnce(new Error(errorMessage));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // console.error の出力を抑制

      await expect(getLatestUnlockLog(userId)).rejects.toThrow(errorMessage);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('calculateUnlockDetails', () => {
    const userId = 'test-user-id';
    const BASE_FEE = 200; // unlockService.ts 内の定数と合わせる
    const MULTIPLIER_INCREMENT = 1.2; // unlockService.ts 内の定数と合わせる

    it('should return base fee and initial multipliers for the first unlock', async () => {
      // getLatestUnlockLog が null を返すようにモック (初回アンロック)
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const details = await calculateUnlockDetails(userId);

      expect(details).toEqual({
        fee: BASE_FEE,
        previousMultiplierToSave: 1.0,
        newMultiplierToSave: MULTIPLIER_INCREMENT,
      });
      // getLatestUnlockLog が呼ばれたことを確認
      expect((firestore as any).mocks.mockCollection).toHaveBeenCalledWith('unlockLogs');
      expect((firestore as any).mocks.mockWhere).toHaveBeenCalledWith('userId', '==', userId);
    });

    it('should calculate fee and multipliers correctly for subsequent unlocks', async () => {
      const previousLogDate = new Date();
      const previousLog: UnlockLogData = {
        userId,
        date: { toDate: () => previousLogDate } as FirebaseFirestoreTypes.Timestamp,
        unlockFee: BASE_FEE * 1.2, // 前々回のアンロック料金 (例)
        previousMultiplier: 1.2,    // 前々回アンロック時に保存された previousMultiplier
        newMultiplier: 1.2 * MULTIPLIER_INCREMENT, // 前々回アンロック時に保存された newMultiplier (これが今回使われる)
      };

      // getLatestUnlockLog が前回のログを返すようにモック
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => previousLog }],
      });

      const details = await calculateUnlockDetails(userId);

      const expectedFee = BASE_FEE * previousLog.newMultiplier;
      const expectedNewMultiplier = previousLog.newMultiplier * MULTIPLIER_INCREMENT;

      expect(details).toEqual({
        fee: expectedFee,
        previousMultiplierToSave: previousLog.newMultiplier,
        newMultiplierToSave: expectedNewMultiplier,
      });
    });

    it('should re-throw error if getLatestUnlockLog fails', async () => {
      const errorMessage = "Error fetching latest log for calculation";
      (firestore as any).mocks.mockGet.mockRejectedValueOnce(new Error(errorMessage));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(calculateUnlockDetails(userId)).rejects.toThrow(errorMessage);
      // calculateUnlockDetails自体はconsole.errorを呼ばないが、内部のgetLatestUnlockLogが呼ぶ
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error fetching latest unlock log: ", expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  describe('processUnlock', () => {
    const userId = 'test-user-process-unlock';
    const fee = 240;
    const previousMultiplier = 1.2;
    const newMultiplier = 1.44;
    let mockTodayDate: Date;
    let mockNowDate: Date;
    let mockTodayTimestamp: FirebaseFirestoreTypes.Timestamp;
    let mockNowTimestamp: FirebaseFirestoreTypes.Timestamp;

    beforeEach(() => {
      // 日付を固定してテストの再現性を高める
      mockTodayDate = new Date('2024-01-15T00:00:00.000Z'); // UTCの0時
      mockNowDate = new Date('2024-01-15T10:30:00.000Z');

      mockTodayTimestamp = { toDate: () => mockTodayDate } as FirebaseFirestoreTypes.Timestamp;
      mockNowTimestamp = { toDate: () => mockNowDate } as FirebaseFirestoreTypes.Timestamp;

      // firestore.Timestamp.fromDate と .now() のモックの戻り値を設定
      (firestore.Timestamp.fromDate as jest.Mock).mockReturnValue(mockTodayTimestamp);
      (firestore.Timestamp.now as jest.Mock).mockReturnValue(mockNowTimestamp);

      // 各テストケースで add, update, get のモックがリセットされるようにする
      (firestore as any).mocks.mockAdd.mockClear();
      (firestore as any).mocks.mockUpdate.mockClear();
      (firestore as any).mocks.mockGet.mockClear();
      (firestore as any).mocks.mockCollection.mockClear();
      (firestore as any).mocks.mockWhere.mockClear();
      (firestore as any).mocks.mockLimit.mockClear();
    });

    it('should add an unlock log and update usageLog if it exists', async () => {
      const mockUsageLogDocRef = { update: (firestore as any).mocks.mockUpdate };
      (firestore as any).mocks.mockAdd.mockResolvedValueOnce({ id: 'new-unlock-log-id' });
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({ // usageLogs.get()
        empty: false,
        docs: [{ id: 'usage-log-doc-id', ref: mockUsageLogDocRef }],
      });

      await processUnlock(userId, fee, previousMultiplier, newMultiplier);

      // 1. unlockLogs への書き込み確認
      expect((firestore as any).mocks.mockCollection).toHaveBeenCalledWith('unlockLogs');
      expect((firestore as any).mocks.mockAdd).toHaveBeenCalledWith({
        userId,
        date: mockNowTimestamp, // getTodayUtcTimestampではなく、nowであるべき
        unlockFee: fee,
        previousMultiplier,
        newMultiplier,
      });

      // 2. usageLogs のクエリと更新確認
      expect((firestore as any).mocks.mockCollection).toHaveBeenCalledWith('usageLogs');
      expect((firestore as any).mocks.mockWhere).toHaveBeenCalledWith('userId', '==', userId);
      // getTodayUtcTimestamp() の結果が使われる
      expect((firestore as any).mocks.mockWhere).toHaveBeenCalledWith('date', '==', mockTodayTimestamp);
      expect((firestore as any).mocks.mockLimit).toHaveBeenCalledWith(1);
      expect((firestore as any).mocks.mockUpdate).toHaveBeenCalledWith({ dailyLimitReached: false });
    });

    it('should only add an unlock log if usageLog does not exist and log a warning', async () => {
      (firestore as any).mocks.mockAdd.mockResolvedValueOnce({ id: 'new-unlock-log-id' });
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({ empty: true, docs: [] }); // usageLogs.get() で空
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await processUnlock(userId, fee, previousMultiplier, newMultiplier);

      expect((firestore as any).mocks.mockAdd).toHaveBeenCalledTimes(1); // unlockLog は記録される
      expect((firestore as any).mocks.mockUpdate).not.toHaveBeenCalled(); // usageLog の更新はされない
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'No usage log found for today to update dailyLimitReached for user:', userId
      );
      consoleWarnSpy.mockRestore();
    });

    it('should throw error if adding unlockLog fails', async () => {
      const addError = new Error('Failed to add unlock log');
      (firestore as any).mocks.mockAdd.mockRejectedValueOnce(addError);
      // usageLogs.get() は呼ばれないはずなので、モック不要

      await expect(processUnlock(userId, fee, previousMultiplier, newMultiplier))
        .rejects.toThrow(addError);
      expect((firestore as any).mocks.mockUpdate).not.toHaveBeenCalled();
    });

    it('should throw error if querying usageLog fails, after adding unlockLog', async () => {
      const getError = new Error('Failed to get usage log');
      (firestore as any).mocks.mockAdd.mockResolvedValueOnce({ id: 'new-unlock-log-id' }); // addは成功
      (firestore as any).mocks.mockGet.mockRejectedValueOnce(getError); // getで失敗

      await expect(processUnlock(userId, fee, previousMultiplier, newMultiplier))
        .rejects.toThrow(getError);
      expect((firestore as any).mocks.mockAdd).toHaveBeenCalledTimes(1); // unlockLogは記録されている
      expect((firestore as any).mocks.mockUpdate).not.toHaveBeenCalled(); // updateはされない
    });

    it('should throw error if updating usageLog fails, after adding unlockLog and finding usageLog', async () => {
      const updateError = new Error('Failed to update usage log');
      const mockUsageLogDocRef = { update: (firestore as any).mocks.mockUpdate };
      (firestore as any).mocks.mockAdd.mockResolvedValueOnce({ id: 'new-unlock-log-id' }); // addは成功
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({ // getも成功
        empty: false,
        docs: [{ id: 'usage-log-doc-id', ref: mockUsageLogDocRef }],
      });
      (firestore as any).mocks.mockUpdate.mockRejectedValueOnce(updateError); // updateで失敗

      await expect(processUnlock(userId, fee, previousMultiplier, newMultiplier))
        .rejects.toThrow(updateError);
      expect((firestore as any).mocks.mockAdd).toHaveBeenCalledTimes(1);
      expect((firestore as any).mocks.mockUpdate).toHaveBeenCalledTimes(1);
    });
  });
}); 