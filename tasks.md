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

## フェーズ2: コア機能実装（利用料支払い・時間設定・メイン画面）

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
    *   [x] FSDに基づき、「現在の1日の使用時間」と「目標の1日の使用時間」をアプリごとに入力するフィールドを配置 (既存の `currentLimit` は「目標」とし、新たに `initialDailyUsageLimit` を導入)。
    *   [x] バリデーションルール実装 (変更後の入力に対応)。
    *   [x] FSDに基づき、上限時間入力フィールドを配置 (1-1440分) **(アプリ/カテゴリごとにも対応)**
    *   [x] バリデーションルール実装
10. **時間設定ロジック (`userService.ts`, `TimeSettingScreen.tsx`)**
    *   [x] 設定された「現在の1日の使用時間」を `users/{userId}.initialDailyUsageLimit` に保存。
    *   [x] 設定された「目標の1日の使用時間」を `users/{userId}.currentLimit` に保存。
    *   [x] `timeLimitSet` フラグを更新。
    *   [x] `challenges` コレクションに新しいチャレンジドキュメントを作成する際、`initialLimitMinutes` には `initialDailyUsageLimit.total` を、`targetLimitMinutes` には `currentLimit.total` を設定。
    *   [x] 設定時間をFirestoreの `users/{userId}` ドキュメントの `currentLimit` に保存 **(アプリ/カテゴリごとにも対応)**
    *   [x] `timeLimitSet` フラグを更新
    *   [x] `challenges` コレクションに新しいチャレンジドキュメントを作成 (ステータス: `active`, `startDate`, `initialLimitMinutes` など)
    *   [x] 成功後、支払い画面へ遷移
11. **メイン画面UI実装 (`MainScreen.tsx`)**
    *   [x] FSDに基づき、各アプリの「今日の許容利用時間」(`users.currentDailyUsageLimit.byApp`) と「残り利用可能時間」を表示。
    *   [x] Firestoreから `users` (特に `currentDailyUsageLimit`) および `usageLogs` の関連データを取得・表示。
    *   [x] FSDに基づき、残り使用時間、当日使用量プログレスバーを表示
    *   [x] Firestoreから `users` および `challenges` の関連データを取得・表示
    *   [x] `usageTrackingService` の共通関数を利用するように修正

## フェーズ3: 時間減少とモニタリング

12. **Cloud Functions: 時間自動減少バッチ処理 (`functions/src/index.ts`)**
    *   [x] `onSchedule` トリガーで毎日定刻に実行。
    *   [x] 全アクティブユーザーの `users` ドキュメントを更新:
        *   [x] `users` ドキュメントの `currentDailyUsageLimit.byApp` を、`initialDailyUsageLimit.byApp` (または直前の`currentDailyUsageLimit.byApp`) と `currentLimit.byApp` を参照して1分ずつ減少させる (ただし `currentLimit.byApp` を下回らない)。0未満にならないように。
        *   [x] `currentDailyUsageLimit.total` を計算して保存。
    *   [x] `challenges` ドキュメントの `currentDailyLimitMinutes` を `users.currentDailyUsageLimit.total` と同期。
    *   [ ] `remainingDays` も更新 (目標達成までの残り日数。基本的な同期は実施済み、詳細な計算ロジックやチャレンジ完了への連動は要検討)。
    *   [x] `onSchedule` トリガーで毎日定刻に実行
    *   [x] 全アクティブユーザーの `challenges` ドキュメントの `currentDailyLimitMinutes` を1分ずつ減少 (0未満にならないように)
    *   [x] `remainingDays` も更新
    *   [x] FirestoreセキュリティルールでFunctionsからの書き込みを許可
13. **使用時間トラッキング (`usageTrackingService.ts`)**
    *   [x] アプリ使用時間を計測するロジック (フォアグラウンド/バックグラウンド考慮)
    *   [x] 一定間隔で `usageLogs` コレクションに当日の使用時間を記録・更新
    *   [x] ログ削減、エラーハンドリング強化、タイマー管理の堅牢性向上
    *   [x] `getTodaysUsageMinutes`, `getAverageUsageMinutesLast30Days` ユーティリティ関数追加
    *   [x] `App.tsx` での初期化処理を再有効化
14. **メイン画面でのリアルタイム表示更新**
    *   [x] Firestoreのリアルタイムリスナーを使用し、`users.currentDailyUsageLimit` や `usageLogs` の変更をメイン画面に反映。
    *   [x] Firestoreのリアルタイムリスナーを使用し、`currentDailyLimitMinutes` や `usageLogs` の変更をメイン画面に反映

## フェーズ4: ロックとアンロック

15. **ロック条件判定とロック画面表示 (`MainScreen.tsx`, `LockScreen.tsx`)**
    *   [x] 当日合計使用時間 (`usageLogs.usedMinutes`) が、その日の合計許容時間 (`users.currentDailyUsageLimit.total`) を超えたらロック画面を表示。
    *   [ ] (参考) 当日使用時間 (`usageLogs.usedMinutesByPackage`) が、そのアプリの `users.currentDailyUsageLimit.byApp` を超えたらロック画面を表示。(アプリ単位ロックは現状未実装)
    *   [x] 当日使用時間が `currentDailyLimitMinutes` を超えたらロック画面を表示
16. **ロック画面UI実装 (`LockScreen.tsx`)**
    *   [x] 「アンロック」「退出」ボタンを配置
    *   [x] アンロック料金の表示 (初期200円、以降前回×1.2倍)
17. **アンロック課金ロジック (`unlockService.ts`, `LockScreen.tsx`)**
    *   [ ] (実際の決済処理は別途検討・実装)
    *   [x] `unlockLogs` コレクションに記録（料金、倍率など）
    *   [x] 成功後、ロック解除 (一時的に利用可能にするか、その日の上限を増やすかなど仕様確認)

## フェーズ5: チャレンジ完了とAmazonギフトAPI連携 (既存項目、必要に応じて更新)

18. **チャレンジ完了条件判定 (`MainScreen.tsx` またはバッチ処理)**
    *   [x] 全てのアプリで `users.currentDailyUsageLimit.byApp` が `users.currentLimit.byApp` 以下になった (つまり `users.currentDailyUsageLimit.total` <= `challenges.targetLimitMinutes`)、または `challenges.remainingDays` が0以下になった場合などで完了。
    *   [x] `currentDailyLimitMinutes` が0になった、または特定の日数経過で完了
19. **完了画面UI実装 (`CompletionScreen.tsx`)**
    *   [x] 「退会（返金）」「継続」ボタンを配置
20. **退会・返金処理 (`userService.ts`, `CompletionScreen.tsx`)**
    *   [x] ユーザーが「退会」を選択した場合、チャレンジステータスを更新
    *   [x] Firestoreのユーザーステータスを更新 (例: `challenges.status` を `completed_refund`)
    *   [x] (オプション) ユーザーデータ削除または匿名化処理
21. **継続処理 (`userService.ts`, `CompletionScreen.tsx`)**
    *   [x] ユーザーが「継続」を選択した場合、新しいチャレンジ設定（再度時間設定から、利用料支払いは不要）へ誘導
    *   [x] Firestoreのユーザーステータスを更新 (例: `challenges.status` を `completed_continue`)

## フェーズ6: ユーザーフロー改善 (指示書ベースの改修 - 2024/05/20完了)

22. **画面遷移ロジック変更 (`AppNavigator.tsx`)**
    *   [x] ログイン → 平均利用時間表示 → 目標時間設定 → 支払い → メイン のフローに変更
    *   [x] `userService.getUserFlowStatus` を利用してユーザーの進捗状況に応じて遷移先を決定
    *   [x] `userService.markAverageUsageTimeFetched` で状態を更新
23. **「過去30日間の平均使用時間把握」画面作成 (`AverageUsageScreen.tsx`)**
    *   [ ] (注記) この画面は新しい仕様（ユーザーが「現在の使用時間」を手動設定）により不要になるか、大幅な役割変更・削除を検討。
    *   [x] 新規作成 (`src/screens/AverageUsageScreen.tsx`)
    *   [x] `usageTrackingService.getAverageUsageMinutesLast30Days` で平均時間を表示 **(合計とアプリ/カテゴリごと表示に対応)**
    *   [x] `userService.markAverageUsageTimeFetched` で状態を更新
24. **既存画面のフロー対応と状態更新**
    *   [x] `TimeSettingScreen.tsx`: 設定完了後に支払い画面 (`DepositScreen`) へ遷移
    *   [x] `DepositScreen.tsx`: 支払い完了後にメイン画面 (`Home`) へ遷移
    *   [x] `MainScreen.tsx`: 新しいデータモデル (`users.currentDailyUsageLimit`) に合わせて表示・ロジックを更新。
25. **サービス層の改修**
    *   [x] `userService.ts`:
        *   [x] `UserFlowStatus` インターフェースと `getUserFlowStatus` 関数追加
        *   [x] `updateUserFlowStatus`, `markAverageUsageTimeFetched` 等のフロー状態更新関数追加
        *   [x] `ensureUserDocument` で新しいフロー管理フィールド (`initialDailyUsageLimit`, `currentDailyUsageLimit` など) の初期値を設定。
        *   [x] `ensureUserDocument` でフロー管理フィールドの初期値を設定
        *   [x] アプリ/カテゴリごとの「現在の使用時間」と「目標時間」設定に対応。
        *   [x] アプリ/カテゴリごとの目標時間設定に対応
    *   [x] `depositService.ts`: `processPayment` 内で `paymentCompleted` フラグを更新
    *   [x] `usageTrackingService.ts`: (フェーズ3の13番で詳細化済み) **(アプリ/カテゴリごとの利用時間記録・取得に対応)**
26. **ドキュメント更新**
    *   [ ] `docs/01_prd.md`: コア機能一覧の更新（新しい時間設定ロジック、メイン画面表示の変更を反映）。
    *   [ ] `docs/02_fsd.md`: 画面要素定義（メイン画面のアプリ別表示追加）、バリデーションルール、機能説明の更新。
    *   [x] `docs/04_data_model.md`: `users`, `challenges` の構造変更を反映 (今回の改修内容を再確認・反映済み)。
    *   [ ] `docs/05_ui_wireframes.md`: UI変更（メイン画面のアプリ別表示追加など）があった旨を記載。
    *   [ ] `README.md`: 機能概要の更新（新しい時間制限ロジックを反映）。
    *   [ ] `ドキュメント.md`: 各ドキュメント概要の更新。
    *   [x] `ドキュメント.md`: 画面遷移図を更新
    *   [x] `docs/04_data_model.md`: `users` コレクションにフロー管理フィールドを追記

## フェーズ7: ユーザーアクティビティ管理 (旧 新しいフェーズ)

27. **ユーザー最終アクティブ日時記録**
    *   [x] アプリ起動時や主要な操作時にユーザーの最終アクティブ日時 (`users.lastActiveDate`) をFirestoreに記録する処理を実装 (`userService.ts`など)。
28. **非アクティブ判定と再決済要求**
    *   [x] 最終アクティブ日時から一定期間（例: 7日）経過したユーザーを非アクティブと判定するロジックを実装 (`userService.ts`)。
    *   [x] 非アクティブユーザーまたは初回未払いユーザーがアプリを再利用しようとした際に、再度利用料支払い画面へ誘導する処理を実装 (`AppNavigator.tsx`, `DepositScreen.tsx`)。(このロジックは今回のユーザーフロー改善で統合・変更された)
    *   [ ] (TODO) 再決済時にも `payments` コレクションに記録し、`users.paymentStatus` を更新。(現状は初回支払いのみ)

## フェーズ8: UI改善とテスト (旧 フェーズ6)

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
    *   **Screens:** (ユーザーフロー変更に伴い、テストケースの見直し・追加が必要)
        *   [x] `src/screens/AuthLoadingScreen.tsx`
        *   [x] `src/screens/CompletionScreen.tsx`
        *   [x] `src/screens/DepositScreen.tsx`
        *   [x] `src/screens/LockScreen.tsx`
        *   [x] `src/screens/LoginScreen.tsx`
        *   [x] `src/screens/MainScreen.tsx`
        *   [x] `src/screens/TimeSettingScreen.tsx`
        *   [ ] `src/screens/AverageUsageScreen.tsx` (新規追加分のテスト作成、または画面削除に伴いテストも削除)
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

## フェーズ9: 時間設定画面へのアプリ手動追加機能 (引き継ぎ資料ベース)

1.  **Android ネイティブモジュール (`UsageStatsModule.kt`) の改修**
    *   [x] `getInstalledLaunchableApps` メソッド追加 (アプリ名、パッケージ名取得)
2.  **React Native 連携 (`nativeUsageStats.ts`) の更新**
    *   [x] `getInstalledLaunchableApps` の型定義と呼び出し関数追加
3.  **アプリ選択UI (`AddAppScreen.tsx`) の新規作成**
    *   [x] `getNativeInstalledLaunchableApps` でアプリ一覧取得・表示 (ABC順ソート、検索機能付き)
    *   [x] 選択されたアプリをFirestoreの `users.manuallyAddedApps` に保存 (`userService.addManuallyAddedApp`)
4.  **既存画面 (`TimeSettingScreen.tsx`) の改修**
    *   [ ] 設定保存時 (`handleConfirm`) に、新しいデータモデル (`initialDailyUsageLimit`, `currentLimit`) を考慮。
    *   [x] `AddAppScreen` へのナビゲーション追加 (例: ヘッダーボタン)
    *   [x] 利用履歴アプリと手動追加アプリをマージして表示 (重複排除、ソート)
    *   [x] 手動追加アプリの利用時間がない場合の表示考慮 (例: "(未計測)")
    *   [x] 設定保存時 (`handleConfirm`) に手動追加アプリも考慮
5.  **ドキュメント更新**
    *   [x] `README.md`, `ドキュメント.md` の更新 (機能追加の反映)
    *   [x] `tasks.md` の更新 (本タスクのチェック)
    *   [ ] `docs/01_prd.md` (コア機能一覧の更新)
    *   [ ] `docs/02_fsd.md` (画面一覧/遷移図、要素定義の更新)
    *   [ ] `docs/04_data_model.md` (`users` コレクションの構造変更反映)
    *   [ ] `docs/05_ui_wireframes.md` (新規画面・変更画面の反映)