import { AppState as RNAppState, AppStateStatus } from 'react-native';
// import firestore from '@react-native-firebase/firestore'; // Original import, now mocked
// import auth from '@react-native-firebase/auth'; // Original import, now mocked
import * as usageTrackingService from '../usageTrackingService';

// Declare global variable for TypeScript
// declare global { // このグローバル宣言は不要になる
//   // eslint-disable-next-line no-var
//   var mockFirestoreRefsForUsageTracking: any;
// }

// --- Mocks ---
jest.useFakeTimers();

// AppState のモックは usageTrackingService.test.ts ローカルで定義し、jest.setup.js とは独立させる
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn(); // AppState.removeEventListener 用 (古いAPIかもしれないが念のため)
const mockSubscriptionRemove = jest.fn(); // addEventListener が返す subscription の remove メソッド用
mockAddEventListener.mockReturnValue({ remove: mockSubscriptionRemove });
let mockCurrentAppState: AppStateStatus = 'active';

jest.mock('react-native/Libraries/AppState/AppState', () => ({
  // __esModule: true, // AppStateを名前付きモックとして扱う場合、これは不要かもしれない
  // AppState が { AppState: { ... } } のようにネストされていないことを確認
  addEventListener: mockAddEventListener,
  removeEventListener: mockRemoveEventListener, // 古いAPIかもしれない
  get currentState() {
    return mockCurrentAppState;
  },
}));

// --- Auth Mock ---
let mockAuthModuleCurrentUser: { uid: string } | null = null;
const mockAuthModuleSignInAnonymously = jest.fn().mockResolvedValue({ user: { uid: 'test-anonymous-uid' } });
const mockAuthModuleOnAuthStateChanged = jest.fn(() => jest.fn()); // Returns an unsubscribe function
const mockAuthModuleSignOut = jest.fn().mockResolvedValue(undefined);
// Add any other auth methods used by the service or other tests
const mockAuthInstance = {
  get currentUser() { return mockAuthModuleCurrentUser; }, // Use a getter to ensure current value
  signInAnonymously: mockAuthModuleSignInAnonymously,
  onAuthStateChanged: mockAuthModuleOnAuthStateChanged,
  signOut: mockAuthModuleSignOut,
  // Ensure all properties expected by the Firebase Auth 'Module' type are present if needed,
  // or use a more general mock type if strict type checking is an issue.
  // For now, focusing on what's used.
};
jest.mock('@react-native-firebase/auth', () => {
  return () => mockAuthInstance; // auth() returns our mock instance
});

// Firestore Mocks - defined at the top level of the module
const mockFirestoreCollection = jest.fn();
const mockFirestoreWhere = jest.fn();
const mockFirestoreLimit = jest.fn();
const mockFirestoreGet = jest.fn();
const mockFirestoreDoc = jest.fn();
const mockFirestoreSet = jest.fn();
const mockFirestoreUpdate = jest.fn();

jest.mock('@react-native-firebase/firestore', () => {
  const actualFirestore = jest.requireActual('@react-native-firebase/firestore');

  // Define how chained calls work, using the top-level mocks
  const whereChainMock = {
    where: mockFirestoreWhere, // Allows for multiple .where() calls if mockFirestoreWhere returns whereChainMock
    limit: mockFirestoreLimit,
    get: mockFirestoreGet, // Allows for .where().get()
  };
  // Make .where() return the chainable object.
  // For multiple .where().where(), mockFirestoreWhere should return whereChainMock or similar.
  // For simplicity here, we assume where().limit().get() or where().where().limit().get()
  mockFirestoreWhere.mockImplementation(() => whereChainMock); 
  mockFirestoreLimit.mockReturnValue({ get: mockFirestoreGet });
  mockFirestoreDoc.mockReturnValue({
    set: mockFirestoreSet,
    update: mockFirestoreUpdate,
    id: 'mockGeneratedDocId' // Provide a mock ID for new documents
  });
  mockFirestoreCollection.mockReturnValue({
    where: mockFirestoreWhere,
    doc: mockFirestoreDoc, // Allows firestore().collection().doc()
  });

  return {
    __esModule: true, // Important for ES6 modules
    default: jest.fn(() => ({ // This is what firestore() returns
      collection: mockFirestoreCollection,
      doc: mockFirestoreDoc, // This allows firestore().doc() - though less common
      // Timestamp and FieldValue can be real or mocked
      // Using real ones can be safer for type checks and complex logic
      Timestamp: actualFirestore.Timestamp,
      FieldValue: actualFirestore.FieldValue,
    })),
    // Export types if needed by the service file, though usually not for mocks
    FirebaseFirestoreTypes: actualFirestore.FirebaseFirestoreTypes,
  };
});

// --- Helper to simulate AppState change ---
type AppStateEvent = 'change';
type AppStateCallBack = (newState: AppStateStatus) => void;

let appStateChangeCallbackForTest: AppStateCallBack | undefined = undefined;

mockAddEventListener.mockImplementation(
    (event: AppStateEvent, callback: AppStateCallBack) => {
        if (event === 'change') {
            appStateChangeCallbackForTest = callback;
        }
        return { remove: mockSubscriptionRemove };
    }
);

const simulateAppStateChange = (newState: AppStateStatus) => {
    mockCurrentAppState = newState;
    if(appStateChangeCallbackForTest) {
        appStateChangeCallbackForTest(newState);
    }
};


describe('usageTrackingService', () => {
  // let usageService: any; // require の結果を保持 - resetUsageTrackingServiceState で再取得するので不要かも
  let mockAuthCurrentUser: { uid: string } | null;
  const testUserId = 'test-user-123';
  const TEST_SAVE_INTERVAL_SECONDS = 60; // Avoid conflict with service's own constant

  // No longer need saveUsageSpy if we are testing Firestore calls directly
  // let saveUsageSpy: jest.SpyInstance; 

  beforeEach(async () => {
    jest.useFakeTimers();
    
    // Reset all top-level mocks
    mockFirestoreCollection.mockClear();
    mockFirestoreWhere.mockClear();
    mockFirestoreLimit.mockClear();
    mockFirestoreGet.mockClear();
    mockFirestoreDoc.mockClear();
    mockFirestoreSet.mockClear();
    mockFirestoreUpdate.mockClear();
    mockAddEventListener.mockClear();
    mockRemoveEventListener.mockClear();
    mockSubscriptionRemove.mockClear();

    // Reset AppState related mocks
    appStateChangeCallbackForTest = undefined;
    mockCurrentAppState = 'active'; // Default to active for AppState.currentState

    // Reset module state for usageTrackingService
    // This re-imports the service, ensuring its internal state (timers, accumulated seconds) is fresh.
    jest.resetModules(); 
    const usageTrackingService = await import('../usageTrackingService');
     // Apply a spy if needed, but allow callThrough to test internal logic
    // jest.spyOn(usageTrackingService, 'saveUsageTimeToFirestore').mockImplementation(async () => {}); // This was blocking internal logic
    // If we want to check if it's called AND it executes:
    jest.spyOn(usageTrackingService, 'saveUsageTimeToFirestore');


    // Auth mock default setup
    mockAuthCurrentUser = null; // Default to no user
    (auth as jest.MockedFunction<typeof auth>).mockImplementation(() => ({ // Correctly cast auth
        currentUser: mockAuthCurrentUser,
    }));

    // Spy on console messages if needed, but clear them
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks(); // Restore console spies etc.
  });

  describe('initializeUsageTracking and AppState changes', () => {
    // let appStateChangeCallbackLocal: (status: AppStateStatus) => void; // Use appStateChangeCallbackForTest
    // let localMockSubscriptionRemove: jest.Mock; // Use mockSubscriptionRemove (top-level)

    beforeEach(() => {
      // AppState.addEventListener mock setup is now at top-level / within jest.mock
      // mockAuthCurrentUser is set to a valid user for these tests
      mockAuthCurrentUser = { uid: testUserId };
      (auth as jest.MockedFunction<typeof auth>).mockImplementation(() => ({
          currentUser: mockAuthCurrentUser,
      }));
    });

    it('should start timer if RNAppState.currentState is active on init', () => {
      mockCurrentAppState = 'active';
      const usageTrackingService = require('../usageTrackingService'); // Re-require to get fresh instance with current AppState
      const cleanup = usageTrackingService.initializeUsageTracking();
      
      expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      
      jest.advanceTimersByTime(1000);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(1);
      
      cleanup();
      expect(mockSubscriptionRemove).toHaveBeenCalled();
    });

    it('should not start timer if RNAppState.currentState is not active on init', () => {
      mockCurrentAppState = 'background';
      const usageTrackingService = require('../usageTrackingService');
      const cleanup = usageTrackingService.initializeUsageTracking();
      
      jest.advanceTimersByTime(1000);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(0);
      
      cleanup();
    });

    it('should start timer when app becomes active, and save periodically when enough time accumulates', async () => {
      mockCurrentAppState = 'inactive'; // Initial state
      const usageTrackingService = require('../usageTrackingService');
      const cleanup = usageTrackingService.initializeUsageTracking();
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(0);

      // Simulate app becoming active
      simulateAppStateChange('active');
      jest.advanceTimersByTime(1000); // 1 second passes
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(1);

      // Prepare Firestore mock for saveUsageTimeToFirestore (new log case)
      // Query for existing log returns empty
      mockFirestoreGet.mockResolvedValueOnce({ empty: true, docs: [] }); 
      // Set new log succeeds
      mockFirestoreSet.mockResolvedValueOnce(undefined); 

      // Advance time to trigger save (SAVE_INTERVAL_SECONDS is 60 in service)
      // We need to ensure saveUsageTimeToFirestore is the original implementation.
      // The spy in beforeEach should not mockImplementation away the original.
      
      // usageTrackingService._setAccumulatedSecondsInForeground(TEST_SAVE_INTERVAL_SECONDS -1); // almost enough
      // jest.advanceTimersByTime(1000); // Advance 1 more second to hit exactly SAVE_INTERVAL_SECONDS
      
      // Alternative: Directly set accumulated time and advance timer to trigger save check
      usageTrackingService._setAccumulatedSecondsInForeground(TEST_SAVE_INTERVAL_SECONDS);
      jest.advanceTimersByTime(1); // Interval check will run


      // Wait for async operations within saveUsageTimeToFirestore
      await jest.runAllTicks(); // Or await new Promise(process.nextTick);

      expect(usageTrackingService.saveUsageTimeToFirestore).toHaveBeenCalled();
      expect(mockFirestoreCollection).toHaveBeenCalledWith('usageLogs');
      expect(mockFirestoreWhere).toHaveBeenCalledWith('userId', '==', testUserId);
      // expect(mockFirestoreWhere).toHaveBeenCalledWith('date', '==', expect.any(actualFirestore.Timestamp)); // More specific check for date
      expect(mockFirestoreGet).toHaveBeenCalled();
      expect(mockFirestoreSet).toHaveBeenCalledTimes(1); // New log created
      expect(mockFirestoreUpdate).not.toHaveBeenCalled(); // No update
      // Accumulated seconds should be reset (or have remainder if SAVE_INTERVAL_SECONDS doesn't divide perfectly)
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(0); 

      cleanup();
    });

    it('should stop timer and attempt to save when app becomes inactive/background', async () => {
      mockCurrentAppState = 'active';
      const usageTrackingService = require('../usageTrackingService');
      const cleanup = usageTrackingService.initializeUsageTracking();
      
      // Simulate app being active and accumulating some time (less than save interval)
      const accumulatedTimeShort = 30;
      usageTrackingService._setAccumulatedSecondsInForeground(accumulatedTimeShort);
      // jest.advanceTimersByTime(accumulatedTimeShort * 1000); // Not needed if _setAccumulatedSecondsInForeground is used

      // Firestore mock for this save attempt (no full minutes, so no actual save to DB)
      // saveUsageTimeToFirestore will be called, but minutesToSave will be 0
      // So, no actual DB call (set/update) should happen for 30 seconds.
      mockFirestoreGet.mockResolvedValueOnce({ empty: true, docs: [] }); // It might still query

      // Simulate app going to background
      simulateAppStateChange('background');
      await jest.runAllTicks();

      expect(usageTrackingService.saveUsageTimeToFirestore).toHaveBeenCalled();
      // For 30 seconds, minutesToSave is 0. So, Firestore set/update should not be called.
      expect(mockFirestoreSet).not.toHaveBeenCalled();
      expect(mockFirestoreUpdate).not.toHaveBeenCalled();
      // The 30 seconds should remain as they were not a full minute
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(accumulatedTimeShort % TEST_SAVE_INTERVAL_SECONDS); 
      
      cleanup();
    });

    it('cleanup function should remove listener, clear timer and attempt final save', async () => {
      mockCurrentAppState = 'active';
      const cleanup = usageTrackingService.initializeUsageTracking();
      appStateChangeCallbackForTest('active');

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
      mockAuthCurrentUser = null;
      usageTrackingService._setAccumulatedSecondsInForeground(TEST_SAVE_INTERVAL_SECONDS + 10);
      await usageTrackingService.saveUsageTimeToFirestore();
      expect((firestore as any).mocks.mockCollection).not.toHaveBeenCalled();
    });

    it('should do nothing if accumulated time is less than TEST_SAVE_INTERVAL_SECONDS', async () => {
      mockAuthCurrentUser = { uid: testUserId };
      usageTrackingService._setAccumulatedSecondsInForeground(TEST_SAVE_INTERVAL_SECONDS - 1);
      await usageTrackingService.saveUsageTimeToFirestore();
      expect((firestore as any).mocks.mockCollection).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(`UsageTracking: Not enough time to save, accumulated: ${TEST_SAVE_INTERVAL_SECONDS -1}s`);
    });
    
    it('should do nothing if minutesToSave is 0, but keep remainder seconds', async () => {
      mockAuthCurrentUser = { uid: testUserId };
      usageTrackingService._setAccumulatedSecondsInForeground(59); 
      await usageTrackingService.saveUsageTimeToFirestore();
      expect((firestore as any).mocks.mockCollection).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('UsageTracking: No full minutes to save.');
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(59);
    });

    it('should create new usage log if none exists for today', async () => {
      mockAuthCurrentUser = { uid: testUserId };
      usageTrackingService._setAccumulatedSecondsInForeground(TEST_SAVE_INTERVAL_SECONDS * 2 + 30); 
      const minutesToSave = 2;
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
      (firestore as any).mocks.mockSet.mockResolvedValueOnce({});
      await usageTrackingService.saveUsageTimeToFirestore();
      expect((firestore as any).mocks.mockSet).toHaveBeenCalledWith(expect.objectContaining({
        userId: testUserId,
        usedMinutes: minutesToSave,
      }));
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(30); 
    });

    it('should update existing usage log if one exists for today', async () => {
      mockAuthCurrentUser = { uid: testUserId };
      usageTrackingService._setAccumulatedSecondsInForeground(TEST_SAVE_INTERVAL_SECONDS + 20); 
      const minutesToSave = 1;
      const initialUsedMinutes = 5;
      const mockDocRefInstance = (firestore as any).mocks.mockDoc;
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ userId: testUserId, usedMinutes: initialUsedMinutes }), ref: mockDocRefInstance }],
      });
      (firestore as any).mocks.mockUpdate.mockResolvedValueOnce({});
      await usageTrackingService.saveUsageTimeToFirestore();
      expect((firestore as any).mocks.mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        usedMinutes: initialUsedMinutes + minutesToSave,
      }));
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(20);
    });

    it('should log error if Firestore operation fails (get)', async () => {
      mockAuthCurrentUser = { uid: testUserId };
      usageTrackingService._setAccumulatedSecondsInForeground(TEST_SAVE_INTERVAL_SECONDS);
      const firestoreError = new Error('Firestore get failed');
      (firestore as any).mocks.mockGet.mockRejectedValueOnce(firestoreError);
      await usageTrackingService.saveUsageTimeToFirestore();
      expect(console.error).toHaveBeenCalledWith('UsageTracking: Error saving usage time to Firestore:', firestoreError);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(TEST_SAVE_INTERVAL_SECONDS);
    });

    it('should log error if Firestore operation fails (set)', async () => {
      mockAuthCurrentUser = { uid: testUserId };
      usageTrackingService._setAccumulatedSecondsInForeground(TEST_SAVE_INTERVAL_SECONDS);
      const firestoreError = new Error('Firestore set failed');
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
      (firestore as any).mocks.mockSet.mockRejectedValueOnce(firestoreError);
      await usageTrackingService.saveUsageTimeToFirestore();
      expect(console.error).toHaveBeenCalledWith('UsageTracking: Error saving usage time to Firestore:', firestoreError);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(TEST_SAVE_INTERVAL_SECONDS);
    });

     it('should log error if Firestore operation fails (update)', async () => {
      mockAuthCurrentUser = { uid: testUserId };
      usageTrackingService._setAccumulatedSecondsInForeground(TEST_SAVE_INTERVAL_SECONDS);
      const firestoreError = new Error('Firestore update failed');
      const mockDocRef = (firestore as any).mocks.mockDoc;
      (firestore as any).mocks.mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ usedMinutes: 5 }), ref: mockDocRef }],
      });
      (firestore as any).mocks.mockUpdate.mockRejectedValueOnce(firestoreError);
      await usageTrackingService.saveUsageTimeToFirestore();
      expect(console.error).toHaveBeenCalledWith('UsageTracking: Error saving usage time to Firestore:', firestoreError);
      expect(usageTrackingService._getAccumulatedSecondsInForeground()).toBe(TEST_SAVE_INTERVAL_SECONDS);
    });
  });
});

// Helper function to reset module state (might be replaceable by jest.resetModules() in beforeEach)
// async function resetUsageTrackingServiceState() {
//   jest.resetModules();
//   const freshService = await import('../usageTrackingService');
//   // You might need to re-apply spies or other setup here if not done in beforeEach
//   return freshService;
// }

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