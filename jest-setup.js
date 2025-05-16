import '@testing-library/jest-native/extend-expect';
import 'react-native-gesture-handler/jestSetup'; // react-native-gesture-handler のセットアップを追加

// Firebase App の基本的なモック
jest.mock('@react-native-firebase/app', () => ({
  __esModule: true, // ES Module として扱う
  default: {
    // apps: [], // 必要に応じてアプリインスタンスのモック
    // initializeApp: jest.fn(), // 初期化関数のモック
    // app: jest.fn(() => ({
    //   // app インスタンスのメソッドやプロパティのモック
    //   name: '[DEFAULT]',
    //   options: {},
    //   // ... その他必要なもの
    // })),
    // utils: () => ({
    //   isRunningInTestHarness: true,
    // }),
    // その他 app モジュールに必要な最小限のモック
    // 例えば、ネイティブモジュールを参照しようとする箇所をダミー関数で置き換えるなど
    nativeModuleExists: jest.fn(() => true), // RNFBAppModule が存在すると見せかける
    INTERNAL: {
      // RNFBAppModule を参照する可能性のある内部プロパティのモック
      moduleAndStatics: {
        'App': {
          // RNFBAppModule の代わりになるような最小限のモック
          NATIVE_MODULE_NAME: 'RNFBAppModule',
          // ... その他 RNFBAppModule が持つと期待されるプロパティやメソッド
        }
      }
    }
  },
  // 名前付きエクスポートがある場合はそれらもモック
  //例: export const someFunction = ... の場合
  // someFunction: jest.fn(), 
}));

// 他に必要なグローバルなモックや設定があればここに追加

// console.error や console.warn をテスト実行時に抑制したい場合 (任意)
// beforeEach(() => {
//   jest.spyOn(console, 'error').mockImplementation(() => {});
//   jest.spyOn(console, 'warn').mockImplementation(() => {});
// }); 