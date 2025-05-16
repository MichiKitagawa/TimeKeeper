*   **認証関連 (`AuthLoadingScreen.tsx`, `LoginScreen.tsx`, `authService.ts`)**
    *   正常系:
        *   匿名認証での自動ログインが成功すること。
        *   ユーザーUIDが取得・保持されること。
    *   異常系:
        *   認証失敗時に適切なエラーハンドリングがされること (今回は匿名認証なので、失敗ケースは限定的)。
*   **利用料支払い関連 (`DepositScreen.tsx`, `paymentService.ts` (旧 `depositService.ts`))**
    *   正常系:
        *   支払いボタン押下で `payments` コレクションに支払い情報が保存されること (ステータス: `completed`)。
        *   ユーザーの `paymentStatus` が更新されること。
        *   支払い成功後、時間設定画面へ遷移すること。
    *   異常系:
        *   支払い処理中にエラーが発生した場合、適切なフィードバックが表示されること。
*   **時間設定関連 (`TimeSettingScreen.tsx`, `userService.ts`)**
    *   正常系:
        *   入力した時間がFirestoreの `users/{userId}/currentLimit` に保存されること。
        *   `challenges` コレクションに新しいチャレンジドキュメントが作成されること。
        *   設定成功後、メイン画面へ遷移すること。
    *   バリデーション:
        *   1-1440分以外の値が入力された場合、エラーメッセージが表示されること (`validators.ts`)。
*   **メイン画面関連 (`MainScreen.tsx`, `usageTrackingService.ts`)**
    *   正常系:
        *   残り使用時間、当日使用量プログレスバーが正しく表示されること (Firestoreデータに基づく)。
        *   アプリ使用時間が `usageLogs` に記録・更新されること。
        *   `currentDailyLimitMinutes` や `usageLogs` の変更がリアルタイムに反映されること。
*   **ロック機能関連 (`LockScreen.tsx`, `unlockService.ts`)**
    *   正常系:
        *   当日使用時間が `currentDailyLimitMinutes` を超えたらロック画面が表示されること。
        *   アンロックボタン押下でアンロック処理が実行され、`unlockLogs` に記録されること。
        *   アンロック成功後、ロックが解除されること。
    *   表示:
        *   アンロック料金が正しく表示されること (初期200円、以降前回×1.2倍)。
*   **チャレンジ完了関連 (`CompletionScreen.tsx`, `userService.ts`)**
    *   正常系:
        *   `currentDailyLimitMinutes` が0になったら完了画面が表示されること。
        *   「退会」選択でユーザーステータスが更新されること。
        *   「継続」選択で新しいチャレンジ設定へ誘導されること。
*   **Cloud Functions (時間自動減少バッチ処理 - `functions/src/index.ts`)**
    *   ※これはReact Nativeのテスト範囲外だが、関連するFirestoreのデータ変更をモックしてテストする。
    *   正常系:
        *   `challenges` ドキュメントの `currentDailyLimitMinutes` が1分ずつ減少すること。
        *   `remainingDays` が更新されること。
*   **ユーザーアクティビティ管理 (`userService.ts`)**
    *   正常系:
        *   アプリ起動時などに `users.lastActiveDate` が更新されること。
        *   非アクティブユーザーが再利用時に支払い画面へ誘導されること。
*   **ユーティリティ (`validators.ts`)**
    *   正常系/異常系:
        *   各種バリデーション関数が期待通りに動作すること。

---
### 既存のテストケース (参考)
* **正常系テストケース**

  1. 頭金登録 → 正常にアプリ起動
  2. 毎日1分ずつ減少するか確認
  3. 上限超過 → ロック発生 → アンロック課金で解除
  4. 目標到達 → 完了画面遷移
* **異常系テストケース**

  1. 券種外の返金額入力 → エラー
  2. ネットワーク断 → APIタイムアウト処理
  3. 二重課金・多重押下 → 防止 