jest.mock('react-native/Libraries/BatchedBridge/NativeModules', () => {
  const actualNativeModules = jest.requireActual('react-native/Libraries/BatchedBridge/NativeModules');
  return {
    ...actualNativeModules,
    RNFBAppModule: {
      NATIVE_FIREBASE_APPS: [], 
      NATIVE_FIREBASE_OPTIONS: {}, 
      FIREBASE_RAW_JSON: '{}',
      addListener: jest.fn(),
      removeListeners: jest.fn(),
      eventsAddListener: jest.fn(), 
      eventsNotifyReady: jest.fn(),
      getCachedApp: jest.fn((appName) => Promise.resolve(null)),
      getConstants: jest.fn(() => ({
        apps: [], 
        options: {}, 
        rawJson: '{}',
        isDeveloperRunning: true, 
        SDK_VERSION: 'mock-sdk-version',
      })),
      initializeApp: jest.fn((options, appConfig) => {
        const appName = (appConfig && appConfig.name) ? appConfig.name : '[DEFAULT]';
        const app = { name: appName, options: options, automaticDataCollectionEnabled: false, delete: jest.fn(() => Promise.resolve()) };
        return Promise.resolve(app);
      }),
      deleteApp: jest.fn((appName) => Promise.resolve()),
      setAutomaticDataCollectionEnabled: jest.fn(),
      setAutomaticResourceManagementEnabled: jest.fn(),
    },
  };
});

jest.mock('@react-native-firebase/app', () => {
  // NativeModules のモックが確実に利用可能であることを確認する
  // RNFBAppModule のモック定義は jest.setup.js の別の場所(上記)で行われている
  const NativeModules = jest.requireActual('react-native/Libraries/BatchedBridge/NativeModules');
  
  // NativeModules.RNFBAppModule が jest.setup.js の最初のモックで設定されているはず
  // もしここで RNFBAppModule がなければ、setup.js の構造かJestの挙動に予期せぬ問題がある
  if (!NativeModules.RNFBAppModule) {
      console.error("jest.setup.js: RNFBAppModule mock was not found in NativeModules when mocking @r-n-f/app. This indicates a serious issue with mock setup order or Jest's behavior.");
      // 強制的にフォールバックモックを設定 (デバッグ用、理想的ではない)
      NativeModules.RNFBAppModule = {
        NATIVE_FIREBASE_APPS: [],
        NATIVE_FIREBASE_OPTIONS: {},
        FIREBASE_RAW_JSON: '{}',
        addListener: jest.fn(),
        removeListeners: jest.fn(),
        eventsAddListener: jest.fn(),
        eventsNotifyReady: jest.fn(),
        getCachedApp: jest.fn().mockResolvedValue(null),
        getConstants: jest.fn().mockReturnValue({ apps: [], options: {}, rawJson: '{}', isDeveloperRunning: true, SDK_VERSION: 'mock-sdk-version' }),
        initializeApp: jest.fn().mockResolvedValue({ name: '[DEFAULT]', options: {}, automaticDataCollectionEnabled: false, delete: jest.fn().mockResolvedValue(undefined) }),
        deleteApp: jest.fn().mockResolvedValue(undefined),
        setAutomaticDataCollectionEnabled: jest.fn(),
        setAutomaticResourceManagementEnabled: jest.fn(),
      };
  }

  const mockAppInstance = {
    name: '[DEFAULT]',
    options: {},
    // ネイティブモジュールへのアクセスポイントを提供
    // RNFBAppModule は上記 jest.mock('react-native/Libraries/BatchedBridge/NativeModules', ...) でモックされているものを参照
    native: NativeModules.RNFBAppModule, 
  };

  const firebaseAppMock = {
    __esModule: true,
    // default export (firebase.default.X)
    default: {
      apps: [mockAppInstance],
      app: jest.fn(() => mockAppInstance),
      initializeApp: jest.fn(() => Promise.resolve(mockAppInstance)),
      SDK_VERSION: 'mock-sdk-version',
      INTERNAL: {
        nativeModule: NativeModules.RNFBAppModule,
        Error: jest.requireActual('@react-native-firebase/app/lib/internal/Error').default,
      },
      // RNFBNativeEventEmitter は、通常 app().emitter 経由でアクセスされるか、
      // あるいは内部的に nativeModule を直接使う。
      // ここで emitter インスタンスをモックすることもできるが、
      // nativeModule が正しく設定されていれば、RNFBNativeEventEmitter はそれを使うはず。
    },
    // named exports (import { app } from '@r-n-f/app')
    app: jest.fn(() => mockAppInstance), 
    apps: [mockAppInstance],             
    initializeApp: jest.fn(() => Promise.resolve(mockAppInstance)), 
    FirebaseApp: jest.fn().mockImplementation(() => mockAppInstance),
  };

  return firebaseAppMock;
});

jest.mock('@react-native-firebase/auth', () => {
  const mockFirebaseAuth = () => ({
    currentUser: null,
    onAuthStateChanged: jest.fn(() => jest.fn()), // returns an unsubscribe function
    signInAnonymously: jest.fn(() => Promise.resolve({ user: { uid: 'mock-uid' } })),
    signOut: jest.fn(() => Promise.resolve()),
    // Add other auth instance methods your app uses e.g. createUserWithEmailAndPassword, etc.
  });
  // Add properties to the mockFirebaseAuth function itself if the module exports them directly
  // e.g. firebase.auth.GoogleAuthProvider
  // @ts-ignore
  mockFirebaseAuth.GoogleAuthProvider = {
    PROVIDER_ID: 'google.com',
    credential: jest.fn(),
  };
  // @ts-ignore
  mockFirebaseAuth.EmailAuthProvider = {
    PROVIDER_ID: 'password',
    credential: jest.fn(),
  };
  return mockFirebaseAuth;
});

jest.mock('@react-native-firebase/firestore', () => {
  const firestoreModule = jest.fn(() => ({
    collection: jest.fn((collectionPath) => ({ 
      _collectionPath: collectionPath,
      doc: jest.fn((documentId) => ({
        id: documentId || `${collectionPath}-doc-${Date.now()}`,
        _path: `${collectionPath}/${documentId || 'auto-id-' + Date.now()}`,
        get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        onSnapshot: jest.fn((optionsOrNext, next, error) => jest.fn()), // unsubscribe
        collection: jest.fn((subCollectionPath) => ({
          // sub-collection mocks if needed
        })),
      })),
      where: jest.fn((field, op, value) => ({ 
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        onSnapshot: jest.fn((optionsOrNext, next, error) => jest.fn()),
      })),
      add: jest.fn((data) => {
        const newId = `${collectionPath}-added-doc-${Date.now()}`;
        return Promise.resolve({ 
            id: newId,
            get: jest.fn().mockResolvedValue({exists: true, data: () => data, id: newId}),
            set: jest.fn(), update: jest.fn(), delete: jest.fn(), onSnapshot: jest.fn(), collection: jest.fn()
        });
      }),
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
    })),
    doc: jest.fn((documentPath) => {
        const parts = documentPath.split('/');
        const id = parts[parts.length -1];
        return {
            id: id,
            _path: documentPath,
            get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
            set: jest.fn().mockResolvedValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            onSnapshot: jest.fn((optionsOrNext, next, error) => jest.fn()),
            collection: jest.fn((subCollectionPath) => ({ 
                 // sub-collection mocks
            })),
        };
    }),
    runTransaction: jest.fn(async (updateFunction) => {
      const transaction = {
        get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      };
      await updateFunction(transaction);
      return Promise.resolve();
    }),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
    settings: jest.fn(),
  }));

  firestoreModule.Timestamp = {
    now: jest.fn(() => ({
      toDate: () => new Date(),
      toMillis: () => Date.now(),
    })),
    fromDate: jest.fn((date) => ({
      toDate: () => date,
      toMillis: () => date.getTime(),
    })),
  };
  firestoreModule.FieldValue = {
    serverTimestamp: jest.fn(() => 'mock-server-timestamp'),
    delete: jest.fn(),
    arrayUnion: jest.fn(),
    arrayRemove: jest.fn(),
    increment: jest.fn(),
  };
  
  return firestoreModule;
});

jest.mock('@react-native-firebase/functions', () => () => ({
  httpsCallable: jest.fn((functionName) => jest.fn((data) => Promise.resolve({ data: {} }))),
}));

// Mock for react-native-device-info
jest.mock('react-native-device-info', () => ({
  getUniqueId: jest.fn(() => Promise.resolve('mock-unique-id')),
  // Add other functions from this library that you use
}));

// Mock for AppState
jest.mock('react-native/Libraries/AppState/AppState', () => ({
  addEventListener: jest.fn((event, callback) => {
    if (event === 'change') {
      // You might want to store this callback and call it manually in tests
      // to simulate app state changes.
      // For now, just return a mock remove function.
    }
    return {
      remove: jest.fn(),
    };
  }),
  removeEventListener: jest.fn(),
  currentState: 'active',
}));

// Mock for react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: jest.fn(({ children }) => children),
    SafeAreaConsumer: jest.fn(({ children }) => children(inset)),
    useSafeAreaInsets: jest.fn(() => inset),
    useSafeAreaFrame: jest.fn(() => ({ x: 0, y: 0, width: 390, height: 844 })), // Example frame
  };
});

// Mock for react-navigation
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      dispatch: jest.fn(),
      setParams: jest.fn(),
      isFocused: jest.fn(() => true), // Assume screen is focused by default
    }),
    useRoute: () => ({
      params: {},
    }),
    useFocusEffect: jest.fn((effect) => {
      // In Jest tests, effects usually run once.
      // If you need to simulate focus/blur, you might need a more complex setup.
      React.useEffect(effect, []);
    }),
    useIsFocused: jest.fn(() => true),
  };
});

jest.mock('@react-navigation/stack', () => ({
  createStackNavigator: jest.fn(() => ({
    Navigator: ({ children }) => <>{children}</>, // Just renders children
    Screen: ({ component, name }) => {
      // A simple mock for Screen that tries to render the component or a placeholder
      const MockScreenComponent = component || (() => <div data-testid={`mock-screen-${name}`}>Mock Screen: {name}</div>);
      return <MockScreenComponent />;
    },
  })),
}));


// It's good practice to import React for JSX if you're using it in mocks
// or provide a global mock if necessary, though usually Jest handles this.
global.React = require('react'); 