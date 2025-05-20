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
    *   [x] 認証状態に応じて出し分ける基本的なスタックナビゲーター (Authスタック, Appスタック) を作成 (`src/navigation/AppNavigator.tsx`)
4.  **Firebase匿名認証の実装**
    *   起動時に匿名認証で自動ログインする処理を実装 (`src/services/authService.ts`, `AuthLoadingScreen.tsx`)
    *   ユーザーUIDの取得と保持 (Context APIまたはZustand等でグローバルに)
5.  **ESLint, Prettier, TypeScript設定**
    *   必要なライブラリをインストール
    *   設定ファイル (`.eslintrc.js`, `.prettierrc.js`, `tsconfig.json`) を作成・設定

## フェーズ2: コア機能実装（時間設定・利用料支払い・メイン画面）

6.  **利用料支払い画面UI実装 (`DepositScreen.tsx`)**
    *   [x] `src/screens/DepositScreen.tsx` ファイル作成 (既存ファイルを流用・改修)
    *   [x] React Native Paper (`react-native-paper`) のインストール (実施済み想定)
    *   [x] 利用料金額表示 (`Text`) の配置 (固定額、例: 5000円)
    *   [x] 支払いボタン (`Button`) の配置
    *   [ ] `src/utils/validators.ts` ファイル作成 (バリデーションルールは簡略化される可能性あり)
    *   [ ] 必要に応じてバリデーションロジックを `DepositScreen.tsx` に組み込み
7.  **Firestore `users` コレクション基本設定**
    *   [x] `docs/04_data_model.md` と `docs/08_firebase_architecture_and_security.md` に基づき、セキュリティルールを設定 (自分のデータのみ読み書き可)
8.  **利用料支払いロジック (`depositService.ts`, `DepositScreen.tsx`)**
    *   [x] `src/services/depositService.ts` を改修
    *   [x] 支払い情報をFirestoreの `payments` コレクションに保存 (ステータス: `completed` など)
    *   [ ] (決済処理の実装 - Stripe等の外部サービス連携を想定、詳細は別途タスク化)
    *   [x] ユーザーの `paymentStatus` 及び `paymentCompleted` フラグを更新 (トランザクション内で実施)
    *   [x] 成功後、メイン画面へ遷移
9.  **時間設定画面UI実装 (`TimeSettingScreen.tsx`)**
    *   [x] インストール済みアプリ一覧を検索・選択式で表示 (`getNativeInstalledLaunchableApps` を使用)。
    *   [x] 選択したアプリに対し、「現在の1日の使用時間(ユーザー入力)」と「目標の1日の使用時間(ユーザー入力)」のフィールドを配置。
    *   [x] 「目標の1日の使用時間」は編集時、既存値からの短縮のみ許可するバリデーションを実装。
    *   [x] バリデーションルール実装 (1-1440分など)。
10. **時間設定ロジック (`userService.ts`, `TimeSettingScreen.tsx`)**
    *   [x] 設定された情報を `users/{userId}` ドキュメントの `initialDailyUsageLimit` (byApp, total) と `currentLimit` (byApp, total) に保存。
    *   [x] `currentDailyUsageLimit` にも `currentLimit` と同値を保存。
    *   [x] `appNameMap` も合わせて保存。
    *   [x] `lockedApps` (追跡・制限対象アプリのリスト) も保存。
    *   [x] `timeLimitSet` フラグを `true` に更新。
    *   [x] 成功後、支払い画面 (`DepositScreen`) へ遷移。
11. **メイン画面UI実装 (`MainScreen.tsx`)**
    *   [x] チャレンジ関連の表示・ロジックをすべて削除。
    *   [x] 追跡対象アプリごとに「今日の使用許可時間」(`users.currentDailyUsageLimit.byApp`) と「今日の使用時間」(`usageLogs.usedMinutesByPackage`) を表示。
    *   [x] 各アプリの進捗バーなどを表示。
    *   [x] Firestoreから `users` (特に `currentDailyUsageLimit`, `appNameMap`, `lockedApps`) および `usageLogs` の関連データを取得・表示。

## フェーズ3: 時間減少とモニタリング

12. **Cloud Functions: 日次処理 (`functions/src/index.ts`)**
    *   [x] `challenges` コレクション関連の処理をすべて削除。
    *   [x] `users` ドキュメントの `currentDailyUsageLimit` を日々自動減少させるロジックを削除 (固定値となるため)。
    *   [ ] (将来的な日次処理があればそのための構造は残す。例: 非アクティブユーザー処理、ログ集計など。現時点では実質No-Op)
13. **使用時間トラッキング (`usageTrackingService.ts`)**
    *   [x] アプリ使用時間を計測するロジック (フォアグラウンド/バックグラウンド考慮)
    *   [x] 一定間隔で `usageLogs` コレクションに当日の使用時間を記録・更新
    *   [x] ログ削減、エラーハンドリング強化、タイマー管理の堅牢性向上
    *   [x] `getTodaysUsageMinutes`, `getAverageUsageMinutesLast30Days` ユーティリティ関数追加
    *   [x] `App.tsx` での初期化処理を再有効化
14. **メイン画面でのリアルタイム表示更新**
    *   [x] Firestoreのリアルタイムリスナーを使用し、`users` や `usageLogs` の変更をメイン画面に反映。

## フェーズ4: ロックとアンロック

15. **ロック条件判定とロック画面表示 (`MainScreen.tsx`, `LockScreen.tsx`)**
    *   [ ] 追跡対象アプリごとに、当日使用時間 (`usageLogs.usedMinutesByPackage[pkg]`) が、その日の使用許可時間 (`users.currentDailyUsageLimit.byApp[pkg]`) を超えたら、そのアプリをロック状態とする。
    *   [ ] 必要に応じて `LockScreen` を表示 (またはメイン画面上でロック状態表示とアンロックボタン)。
16. **ロック画面UI実装 (`LockScreen.tsx`)**
    *   [x] 「アンロック」「退出」ボタンを配置
    *   [x] アンロック料金の表示 (初期200円、以降前回×1.2倍)
17. **アンロック課金ロジック (`unlockService.ts`, `LockScreen.tsx`)**
    *   [ ] (実際の決済処理は別途検討・実装)
    *   [x] `unlockLogs` コレクションに記録（料金、倍率など）
    *   [x] 成功後、ロック解除 (一時的に利用可能にするか、その日の上限を増やすかなど仕様確認)

## フェーズ5: チャレンジ完了とAmazonギフトAPI連携 (フェーズ自体を削除)

## フェーズ6: ユーザーフロー改善 (新しいフローに準拠)

22. **画面遷移ロジック変更 (`AppNavigator.tsx`)**
    *   [x] ログイン → (時間未設定なら)時間設定 → (未払いなら)支払い → メイン のフローに。
    *   [x] `userService.getUserFlowStatus` を利用してユーザーの進捗状況に応じて遷移先を決定 (`averageUsageTimeFetched` は削除)。
23. **既存画面のフロー対応と状態更新**
    *   [x] `TimeSettingScreen.tsx`: 設定完了後に支払い画面 (`DepositScreen`) へ遷移。
    *   [x] `DepositScreen.tsx`: 支払い完了後にメイン画面 (`MainScreen`) へ遷移。
    *   [x] `MainScreen.tsx`: 新しいデータモデル (`users.currentDailyUsageLimit`) に合わせて表示・ロジックを更新。
24. **サービス層の改修 (`userService.ts`)**
    *   [x] `UserFlowStatus` から `currentChallengeId`, `averageUsageTimeFetched` を削除。
    *   [x] `setUserInitialTimeLimitAndCreateChallenge` を `setUserTimeSettings` に変更し、チャレンジ作成ロジックを削除。
    *   [x] `ensureUserDocument` でフロー管理フィールドの初期値を新しい仕様に合わせる (`averageUsageTimeFetched` 削除)。
    *   [x] チャレンジ関連関数 (`requestRefund`, `continueChallenge` など) を削除。
25. **ドキュメント更新**
    *   [ ] `docs/01_prd.md`, `docs/02_fsd.md`, `docs/04_data_model.md`, `docs/05_ui_wireframes.md`, `README.md`, `ドキュメント.md` を新しい仕様に合わせて更新。

## フェーズ7: ユーザーアクティビティ管理 (チャレンジへの言及削除)

27. **ユーザー最終アクティブ日時記録**
    *   [x] アプリ起動時や主要な操作時にユーザーの最終アクティブ日時 (`users.lastActiveDate`) をFirestoreに記録する処理を実装 (`userService.ts`など)。
28. **非アクティブ判定と再決済要求**
    *   [x] 最終アクティブ日時から一定期間（例: 7日）経過したユーザーを非アクティブと判定するロジックを実装 (`userService.ts`)。
    *   [x] 非アクティブユーザーまたは初回未払いユーザーがアプリを再利用しようとした際に、再度利用料支払い画面へ誘導する処理を実装 (`AppNavigator.tsx`, `DepositScreen.tsx`)。(このロジックは今回のユーザーフロー改善で統合・変更された)
    *   [ ] (TODO) 再決済時にも `payments` コレクションに記録し、`users.paymentStatus` を更新。(現状は初回支払いのみ)

## フェーズ8: UI改善とテスト (テストケースの見直し)

29. **UI全体のデザイン調整・改善**
    *   [ ] React Native PaperなどのUIライブラリ導入検討 (導入済みだが、さらなる調整)
    *   [ ] 各画面のユーザビリティ向上
30. **単体テスト・結合テスト作成 (Jest, React Native Testing Library)**
    *   **Services:**
        *   [x] `src/services/authService.ts`
        *   [x] `src/services/depositService.ts`
        *   [x] `src/services/unlockService.ts`
        *   [x] `src/services/usageTrackingService.ts` (カバレッジ向上検討)
        *   [x] `src/services/userService.ts` (カバレッジ向上検討)
    *   **Utils:**
        *   [x] `src/utils/validators.ts`
    *   **Screens:**
        *   [ ] `src/screens/TimeSettingScreen.tsx` (大幅なテストケース変更)
        *   [ ] `src/screens/MainScreen.tsx` (大幅なテストケース変更)
        *   [ ] `src/screens/AverageUsageScreen.tsx` (テスト削除)
        *   [ ] `src/screens/CompletionScreen.tsx` (テスト削除)
    *   **Navigation:**
        *   [x] `src/navigation/AppNavigator.tsx` (テストケースの見直し・追加が必要)
    *   (その他、必要に応じてカスタムフックや共通コンポーネントのテストを追加)
31. **E2Eテスト (Appium, Detoxなど、オプション)**
    *   [ ] 主要なユーザーフローの自動テスト

## その他・継続タスク

*   [ ] Firebaseセキュリティルールの継続的な見直しと強化
*   [ ] エラーハンドリングの強化 (Crashlytics連携)
*   [ ] パフォーマンス監視と最適化 (Performance Monitoring連携)
*   [x] ドキュメントの最新化 (本整備タスクで対応中)

## フェーズ9: 時間設定画面へのアプリ手動追加機能 (`AddAppScreen.tsx` は `TimeSettingScreen.tsx` に統合)

*   [ ] Android ネイティブモジュール (`UsageStatsModule.kt`) の `getInstalledLaunchableApps` は引き続き利用。
*   [ ] React Native 連携 (`nativeUsageStats.ts`) も引き続き利用。
*   [ ] `AddAppScreen.tsx` は削除または役割変更。
*   [ ] `TimeSettingScreen.tsx` で手動追加（実質全アプリ選択）と時間設定を一括で行う。