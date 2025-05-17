import { AppState as RNAppState, AppStateStatus } from 'react-native';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import * as usageTrackingService from '../usageTrackingService';

// Declare global variable for TypeScript
declare global {
  // eslint-disable-next-line no-var
  var mockFirestoreRefsForUsageTracking: any;
}

// --- Mocks ---
jest.useFakeTimers();

// AppState のモックは usageTrackingService.test.ts ローカルで定義し、jest.setup.js とは独立させる
const mockAddEventListener = jest.fn();
const mockRemove = jest.fn();
mockAddEventListener.mockReturnValue({ remove: mockRemove });
let mockCurrentState: AppStateStatus = 'active';

jest.mock('react-native/Libraries/AppState/AppState', () => ({
  // __esModule: true, // AppStateを名前付きモックとして扱う場合、これは不要かもしれない
  // AppState が { AppState: { ... } } のようにネストされていないことを確認
  addEventListener: mockAddEventListener,
  get currentState() {
    return mockCurrentState;
  },
}));

jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({ currentUser: null })),
}));

// jest.mock の中でモック関数を定義・使用する
jest.mock('@react-native-firebase/firestore', () => {
  // Define mocks first
  const mockFirestoreCollection = jest.fn();
  const mockFirestoreWhere = jest.fn();
  const mockFirestoreLimit = jest.fn();
  const mockFirestoreGet = jest.fn();
  const mockFirestoreDoc = jest.fn();
  const mockFirestoreSet = jest.fn();
  const mockFirestoreUpdate = jest.fn();

  // Assign to global at the very beginning of the factory
  (global as any).mockFirestoreRefsForUsageTracking = {
    mockFirestoreCollection,
    mockFirestoreWhere,
    mockFirestoreLimit,
    mockFirestoreGet,
    mockFirestoreDoc,
    mockFirestoreSet,
    mockFirestoreUpdate,
  };

  // Firestoreの各メソッドのモック実装
  mockFirestoreDoc.mockReturnValue({
    set: mockFirestoreSet,
    update: mockFirestoreUpdate,
  });

  mockFirestoreLimit.mockReturnValue({
    get: mockFirestoreGet,
  });

  // whereはチェーンできるように自身を返すか、最終的にlimit().get()につながるようにする
  // whereChain の型を明示的に定義
  const whereChain: { 
    where: jest.Mock<any, any>; 
    limit: jest.Mock<any, any>; 
    get: jest.Mock<any, any>; 
  } = {
    where: jest.fn(() => whereChain), // チェーン用
    limit: mockFirestoreLimit,
    get: mockFirestoreGet, // where().get() の場合
  };
  mockFirestoreWhere.mockReturnValue(whereChain);

  mockFirestoreCollection.mockReturnValue({
    where: mockFirestoreWhere,
    doc: mockFirestoreDoc,
  });

  // Return the mocked firestore instance, including Timestamp and FieldValue
  return () => ({
    collection: mockFirestoreCollection,
    doc: mockFirestoreDoc,
    Timestamp: {
      now: jest.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
      fromDate: jest.fn((date: Date) => ({ toDate: () => date, toMillis: () => date.getTime() })),
    },
    FieldValue: {
        serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP_MOCK'), // Consistent mock value
        delete: jest.fn(),
        arrayUnion: jest.fn(),
        arrayRemove: jest.fn(),
        increment: jest.fn(),
    }
  });
});

// --- Helper to simulate AppState change ---
type AppStateEvent = 'change';
type AppStateCallBack = (newState: AppStateStatus) => void;

let appStateChangeCallback: AppStateCallBack | undefined = undefined;

mockAddEventListener.mockImplementation(
    (event: AppStateEvent, callback: AppStateCallBack) => {
        if (event === 'change') {
            appStateChangeCallback = callback;
        }
        return { remove: mockRemove };
    }
);

const simulateAppStateChange = (newState: AppStateStatus) => {
    mockCurrentState = newState;
    if(appStateChangeCallback) {
        appStateChangeCallback(newState);
    }
};


describe('usageTrackingService', () => {
  let usageService: any; // require の結果を保持
  let mockCurrentUser: { uid: string } | null;
  const userId_parent = 'test-user-123'; // 親スコープでの定義名変更
  const SAVE_INTERVAL_SECONDS_parent = 60; // 親スコープでの定義名変更
  let saveUsageSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    // モジュールをリセットして、usageTrackingService内の状態(accumulatedSeconds, timer)を初期化
    usageService = await resetUsageTrackingServiceState();

    // Firestoreモック関数をクリア
    if ((firestore as any).clearMocks) {
      (firestore as any).clearMocks();
    }
    
    // AppStateモックをクリア (必要に応じて)
    (RNAppState.addEventListener as jest.Mock).mockClear();
    // (RNAppState.removeEventListener as jest.Mock).mockClear(); // これは古いので不要かも

    // Authモックのデフォルト設定
    mockCurrentUser = null; // デフォルトはnull
    (auth as unknown as jest.Mock).mockImplementation(() => ({
        currentUser: mockCurrentUser,
    }));

    // console.log/warn/error のスパイを必要に応じて設定
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    saveUsageSpy = jest.spyOn(usageTrackingService, 'saveUsageTimeToFirestore').mockImplementation(async () => {}); 
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks(); // consoleのスパイなどを元に戻す
  });

  // --- saveUsageTimeToFirestore (直接エクスポートされていないため、initializeUsageTracking経由でテストするか、内部実装のテストとして記述) ---
  // 今回はinitializeUsageTrackingを呼び、AppStateの変化やタイマー発火を通じてsaveUsageTimeToFirestoreをテストする方針で進める。
  // ただし、saveUsageTimeToFirestore 単体のロジック確認もしたいため、一時的にエクスポートするか、
  // initializeUsageTracking のテストケースの中で網羅的に検証する。
  // ここでは、まず initializeUsageTracking と handleAppStateChange のテストを通じて saveUsageTimeToFirestore の挙動をカバーする。

  describe('initializeUsageTracking and AppState changes', () => {
    let appStateChangeCallback: (status: AppStateStatus) => void;
    let mockSubscriptionRemove: jest.Mock;
    const userId = userId_parent; // 親スコープからコピー
    const SAVE_INTERVAL_SECONDS = SAVE_INTERVAL_SECONDS_parent; // 親スコープからコピー

    beforeEach(() => {
      // AppState.addEventListener のモックからコールバックとremove関数を取得
      // AppStateのモックを修正し、addEventListenerが返すオブジェクトにremoveモックを含める
      mockSubscriptionRemove = jest.fn();
      (RNAppState.addEventListener as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'change') {
          appStateChangeCallback = callback;
        }
        return { remove: mockSubscriptionRemove }; 
      });
      mockCurrentUser = { uid: userId }; // このdescribeブロックでは常に認証済みとする
    });

    it('should start timer if RNAppState.currentState is active on init', () => {
      mockCurrentState = 'active';
      const cleanup = usageTrackingService.initializeUsageTracking();
      
      expect(RNAppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      
      // タイマーが開始されていることを確認 (例: 1秒後にaccumulatedSecondsが増えている)
      jest.advanceTimersByTime(1000);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(1);
      
      cleanup();
    });

    it('should not start timer if RNAppState.currentState is not active on init', () => {
      mockCurrentState = 'background';
      const cleanup = usageTrackingService.initializeUsageTracking();
      
      jest.advanceTimersByTime(1000);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(0);
      
      cleanup();
    });

    it('should start timer when app becomes active, and save periodically', async () => {
      mockCurrentState = 'inactive'; // 初期状態は非アクティブ
      const cleanup = usageTrackingService.initializeUsageTracking();
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(0);

      // アプリがアクティブになる
      appStateChangeCallback('active');
      jest.advanceTimersByTime(1000);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(1);

      // SAVE_INTERVAL_SECONDS まで時間を進める
      usageTrackingService._setAccumulatedSecondsInForeground(0); // reset for this part of test
      (firestore as any).mocks.mockGet.mockResolvedValue({ empty: true, docs: [] });
      (firestore as any).mocks.mockSet.mockResolvedValue({}); 

      jest.advanceTimersByTime(SAVE_INTERVAL_SECONDS * 1000);
      await Promise.resolve(); // saveUsageTimeToFirestore の非同期処理を待つ

      expect(usageTrackingService.saveUsageTimeToFirestore).toHaveBeenCalledTimes(1); // saveUsageTimeToFirestoreが呼ばれたことを確認
                                                              // そのためにはsaveUsageTimeToFirestoreもspy化するか、Firestoreのメソッド呼び出しで確認
      expect((firestore as any).mocks.mockSet).toHaveBeenCalledTimes(1);                                                       
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(0); // 保存後リセットされる(端数なしの場合)

      cleanup();
    });

    it('should stop timer and attempt to save when app becomes inactive/background', async () => {
      mockCurrentState = 'active';
      const cleanup = usageTrackingService.initializeUsageTracking();
      appStateChangeCallback('active'); // 強制的にactiveにしてタイマースタート

      jest.advanceTimersByTime(30 * 1000); // 30秒経過
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(30);

      // Firestoreモックを設定 (30秒では0分なので保存されないはずだが、呼び出しはされる)
      (firestore as any).mocks.mockGet.mockResolvedValue({ empty: true, docs: [] });

      // アプリがバックグラウンドになる
      appStateChangeCallback('background');
      await Promise.resolve(); 
      
      expect(usageTrackingService.saveUsageTimeToFirestore).toHaveBeenCalledTimes(1); // 呼ばれることの確認
      expect((firestore as any).mocks.mockSet).not.toHaveBeenCalled(); // 0分なので実際にはsetされない
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(30); // 保存試行後も変わらない (0分だったため)

      // タイマーが停止していることを確認 (さらに時間を進めても秒数が増えない)
      const currentSeconds = usageTrackingService._getAccumulatedSecondsInForeground();
      jest.advanceTimersByTime(10000);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(currentSeconds);

      cleanup();
    });

    it('cleanup function should remove listener, clear timer and attempt final save', async () => {
      mockCurrentState = 'active';
      const cleanup = usageTrackingService.initializeUsageTracking();
      appStateChangeCallback('active');

      jest.advanceTimersByTime(25 * 1000); // 25秒経過
      (firestore as any).mocks.mockGet.mockResolvedValue({ empty: true, docs: [] });

      cleanup(); // クリーンアップ実行
      await Promise.resolve();

      expect(mockSubscriptionRemove).toHaveBeenCalledTimes(1);
      expect(usageTrackingService.saveUsageTimeToFirestore).toHaveBeenCalledTimes(1);
      expect((firestore as any).mocks.mockSet).not.toHaveBeenCalled(); // 25秒は0分

      // タイマーが停止していることを確認
      const secondsAfterCleanup = usageTrackingService._getAccumulatedSecondsInForeground();
      jest.advanceTimersByTime(10000);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(secondsAfterCleanup); 
    });
  });

  describe('saveUsageTimeToFirestore (direct tests)', () => {
    it('should do nothing if user is not authenticated', async () => {
      mockCurrentUser = null;
      usageTrackingService._setAccumulatedSecondsInForeground(SAVE_INTERVAL_SECONDS_parent + 10);
      await usageTrackingService.saveUsageTimeToFirestore();
      expect((firestore as any).mocks.mockCollection).not.toHaveBeenCalled();
    });

    it('should do nothing if accumulated time is less than SAVE_INTERVAL_SECONDS_parent', async () => {
      mockCurrentUser = { uid: userId_parent };
      usageTrackingService._setAccumulatedSecondsInForeground(SAVE_INTERVAL_SECONDS_parent - 1);
      await usageTrackingService.saveUsageTimeToFirestore();
      expect((firestore as any).mocks.mockCollection).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(`UsageTracking: Not enough time to save, accumulated: ${SAVE_INTERVAL_SECONDS_parent -1}s`);
    });
    
    it('should do nothing if minutesToSave is 0, but keep remainder seconds', async () => {
      mockCurrentUser = { uid: userId_parent };
      usageTrackingService._setAccumulatedSecondsInForeground(59); 
      await usageTrackingService.saveUsageTimeToFirestore();
      expect((firestore as any).mocks.mockCollection).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('UsageTracking: No full minutes to save.');
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(59);
    });

    it('should create new usage log if none exists for today', async () => {
      mockCurrentUser = { uid: userId_parent };
      usageTrackingService._setAccumulatedSecondsInForeground(SAVE_INTERVAL_SECONDS_parent * 2 + 30); 
      const minutesToSave = 2;
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
      (firestore as any).mocks.mockSet.mockResolvedValueOnce({});
      await usageTrackingService.saveUsageTimeToFirestore();
      expect((firestore as any).mocks.mockSet).toHaveBeenCalledWith(expect.objectContaining({
        userId: userId_parent,
        usedMinutes: minutesToSave,
      }));
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(30); 
    });

    it('should update existing usage log if one exists for today', async () => {
      mockCurrentUser = { uid: userId_parent };
      usageTrackingService._setAccumulatedSecondsInForeground(SAVE_INTERVAL_SECONDS_parent + 20); 
      const minutesToSave = 1;
      const initialUsedMinutes = 5;
      const mockDocRefInstance = (firestore as any).mocks.mockDoc;
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ userId: userId_parent, usedMinutes: initialUsedMinutes }), ref: mockDocRefInstance }],
      });
      (firestore as any).mocks.mockUpdate.mockResolvedValueOnce({});
      await usageTrackingService.saveUsageTimeToFirestore();
      expect((firestore as any).mocks.mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        usedMinutes: initialUsedMinutes + minutesToSave,
      }));
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(20);
    });

    it('should log error if Firestore operation fails (get)', async () => {
      mockCurrentUser = { uid: userId_parent };
      usageTrackingService._setAccumulatedSecondsInForeground(SAVE_INTERVAL_SECONDS_parent);
      const firestoreError = new Error('Firestore get failed');
      (firestore as any).mocks.mockGet.mockRejectedValueOnce(firestoreError);
      await usageTrackingService.saveUsageTimeToFirestore();
      expect(console.error).toHaveBeenCalledWith('UsageTracking: Error saving usage time to Firestore:', firestoreError);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(SAVE_INTERVAL_SECONDS_parent);
    });

    it('should log error if Firestore operation fails (set)', async () => {
      mockCurrentUser = { uid: userId_parent };
      usageTrackingService._setAccumulatedSecondsInForeground(SAVE_INTERVAL_SECONDS_parent);
      const firestoreError = new Error('Firestore set failed');
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
      (firestore as any).mocks.mockSet.mockRejectedValueOnce(firestoreError);
      await usageTrackingService.saveUsageTimeToFirestore();
      expect(console.error).toHaveBeenCalledWith('UsageTracking: Error saving usage time to Firestore:', firestoreError);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(SAVE_INTERVAL_SECONDS_parent);
    });

     it('should log error if Firestore operation fails (update)', async () => {
      mockCurrentUser = { uid: userId_parent };
      usageTrackingService._setAccumulatedSecondsInForeground(SAVE_INTERVAL_SECONDS_parent);
      const firestoreError = new Error('Firestore update failed');
      const mockDocRef = (firestore as any).mocks.mockDoc;
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ usedMinutes: 5 }), ref: mockDocRef }],
      });
      (firestore as any).mocks.mockUpdate.mockRejectedValueOnce(firestoreError);
      await usageTrackingService.saveUsageTimeToFirestore();
      expect(console.error).toHaveBeenCalledWith('UsageTracking: Error saving usage time to Firestore:', firestoreError);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(SAVE_INTERVAL_SECONDS_parent);
    });
  });
});

// usageTrackingService の内部状態をリセットするためのヘルパー
// initializeUsageTracking を呼び出すと内部タイマーやリスナーがセットアップされるので、
// 各テストケース実行前にモジュール自体をリセットしてクリーンな状態から始める。
const resetUsageTrackingServiceState = async () => {
  jest.resetModules();
  // リセット後、再度モックを設定する必要がある場合がある
  // 特に、モジュール内でグローバルに保持している変数など
  // usageTrackingServiceはaccumulatedSecondsInForegroundとforegroundTimerを内部に持つ
  // これらを直接リセットする手段がないため、resetModulesで対応。
  // その後、必要な関数を再度インポート
  const usageTracking = require('../usageTrackingService');
  return usageTracking;
}; 