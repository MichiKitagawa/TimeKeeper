# 開発タスク一覧 (React Native + Firebase)

## フェーズ1: 環境構築と基本認証

1.  **React Native開発環境セットアップ**
    *   Node.js, JDK, Android Studio, Watchmanのインストール
    *   React Native CLIのインストール
    *   エミュレータまたは実機での "Hello World" 表示確認
2.  **Firebaseプロジェクト作成と連携設定**
    *   Firebaseコンソールでプロジェクト作成
    *   AndroidアプリをFirebaseプロジェクトに追加
    *   `google-services.json` をプロジェクトに配置
    *   `@react-native-firebase/app` と `@react-native-firebase/auth` をインストール、ネイティブ設定
3.  **基本的なナビゲーション設定 (React Navigation)**
    *   `@react-navigation/native`, `@react-navigation/stack` などをインストール
    *   認証状態に応じて出し分ける基本的なスタックナビゲーター (Authスタック, Appスタック) を作成 (`src/navigation/AppNavigator.tsx`)
4.  **Firebase匿名認証の実装**
    *   起動時に匿名認証で自動ログインする処理を実装 (`src/services/authService.ts`, `AuthLoadingScreen.tsx`)
    *   ユーザーUIDの取得と保持 (Context APIまたはZustand等でグローバルに)
5.  **ESLint, Prettier, TypeScript設定**
    *   必要なライブラリをインストール
    *   設定ファイル (`.eslintrc.js`, `.prettierrc.js`, `tsconfig.json`) を作成・設定

## フェーズ2: コア機能実装（頭金・時間設定・メイン画面）

6.  **頭金入力画面UI実装 (`DepositScreen.tsx`)**
    *   [x] `src/screens/DepositScreen.tsx` ファイル作成
    *   [x] React Native Paper (`react-native-paper`) のインストール
    *   [x] 返金希望額入力 (`TextInput`) の配置
    *   [x] 手数料率表示 (`Text`) の配置 (仮の値)
    *   [x] 券種選択ドロップダウン (`Menu`) の配置と仮データ設定
    *   [x] 計算された手数料表示 (`Text`) の配置
    *   [x] お支払い総額表示 (`Text`) の配置
    *   [x] 確認ボタン (`Button`) の配置
    *   [x] `src/utils/validators.ts` ファイル作成
    *   [ ] バリデーションロジックを `DepositScreen.tsx` に組み込み
7.  **Firestore `users` コレクション基本設定**
    *   [x] `docs/04_data_model.md` と `docs/08_firebase_architecture_and_security.md` に基づき、セキュリティルールを設定 (自分のデータのみ読み書き可)
8.  **頭金登録ロジック (`depositService.ts`, `DepositScreen.tsx`)**
    *   [x] 入力値をFirestoreの `deposits` コレクションに保存 (ステータス: `pending`)
    *   [x] (将来の決済連携を考慮し、トランザクションIDフィールドも用意)
    *   [x] 成功後、時間設定画面へ遷移
9.  **時間設定画面UI実装 (`TimeSettingScreen.tsx`)**
    *   [x] FSDに基づき、上限時間入力フィールドを配置 (1-1440分)
    *   [x] バリデーションルール実装
10. **時間設定ロジック (`userService.ts`, `TimeSettingScreen.tsx`)**
    *   [x] 設定時間をFirestoreの `users/{userId}` ドキュメントの `currentLimit` に保存 (初回のみ設定可とするロジックを実装)
    *   [x] `challenges` コレクションに新しいチャレンジドキュメントを作成 (ステータス: `active`, `startDate`, `initialLimitMinutes` など)
    *   [x] 成功後、メイン画面へ遷移
11. **メイン画面UI実装 (`MainScreen.tsx`)**
    *   FSDに基づき、残り使用時間、当日使用量プログレスバーを表示
    *   Firestoreから `users` および `challenges` の関連データを取得・表示
    *   (ダミーデータで初期表示、後にFirebase連携)

## フェーズ3: 時間減少とモニタリング

12. **Cloud Functions: 時間自動減少バッチ処理 (`functions/src/index.ts`)**
    *   `onSchedule` トリガーで毎日定刻に実行
    *   全アクティブユーザーの `challenges` ドキュメントの `currentDailyLimitMinutes` を1分ずつ減少 (0未満にならないように)
    *   `remainingDays` も更新
    *   FirestoreセキュリティルールでFunctionsからの書き込みを許可
13. **使用時間トラッキング (フォアグラウンド/バックグラウンド考慮)**
    *   アプリ使用時間を計測するロジック (React Nativeのライフサイクルイベント、ヘッドレスJSなどを検討)
    *   一定間隔で `usageLogs` コレクションに当日の使用時間を記録・更新
14. **メイン画面でのリアルタイム表示更新**
    *   Firestoreのリアルタイムリスナーを使用し、`currentDailyLimitMinutes` や `usageLogs` の変更をメイン画面に反映

## フェーズ4: ロックとアンロック

15. **ロック条件判定とロック画面表示 (`MainScreen.tsx`, `LockScreen.tsx`)**
    *   当日使用時間が `currentDailyLimitMinutes` を超えたらロック画面を表示
16. **ロック画面UI実装 (`LockScreen.tsx`)**
    *   「アンロック」「退出」ボタンを配置
    *   アンロック料金の表示 (初期200円、以降前回×1.2倍)
17. **アンロック課金ロジック (`unlockService.ts`, `LockScreen.tsx`)**
    *   (実際の決済処理は別途検討・実装)
    *   `unlockLogs` コレクションに記録（料金、倍率など）
    *   成功後、ロック解除 (一時的に利用可能にするか、その日の上限を増やすかなど仕様確認)

## フェーズ5: チャレンジ完了とAmazonギフトAPI連携

18. **チャレンジ完了条件判定 (`MainScreen.tsx` またはバッチ処理)**
    *   `currentDailyLimitMinutes` が0になった、または特定の日数経過で完了
19. **完了画面UI実装 (`CompletionScreen.tsx`)**
    *   「退会（返金）」「継続」ボタンを配置
20. **Cloud Functions: AmazonギフトAPI連携 (`functions/src/index.ts`)**
    *   HTTPS Callable Functionとして実装
    *   クライアントからリクエストを受け、AmazonギフトAPIにギフト券発行をリクエスト
    *   APIキーはFunctionsの環境変数で管理
    *   発行されたギフトコードをクライアントに返す
21. **退会・返金処理 (`userService.ts`, `CompletionScreen.tsx`)**
    *   ユーザーが「退会」を選択した場合、上記Cloud Functionを呼び出しギフトコード取得
    *   Firestoreのユーザーステータスを更新 (例: `challenges.status` を `completed_refund`)
    *   (オプション) ユーザーデータ削除または匿名化処理
22. **継続処理 (`userService.ts`, `CompletionScreen.tsx`)**
    *   ユーザーが「継続」を選択した場合、新しいチャレンジ設定（再度頭金・時間設定から）へ誘導
    *   Firestoreのユーザーステータスを更新 (例: `challenges.status` を `completed_continue`)

## フェーズ6: UI改善とテスト

23. **UI全体のデザイン調整・改善**
    *   React Native PaperなどのUIライブラリ導入検討
    *   各画面のユーザビリティ向上
24. **単体テスト・結合テスト作成 (Jest, React Native Testing Library)**
    *   主要コンポーネント、カスタムフック、サービス関数のテストケース作成
25. **E2Eテスト (Appium, Detoxなど、オプション)**
    *   主要なユーザーフローの自動テスト

## その他・継続タスク

*   Firebaseセキュリティルールの継続的な見直しと強化
*   エラーハンドリングの強化 (Crashlytics連携)
*   パフォーマンス監視と最適化 (Performance Monitoring連携)
*   ドキュメントの最新化 