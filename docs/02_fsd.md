* **画面一覧／遷移図**

  * 起動画面 → （認証）→ 平均利用時間表示 → 目標時間設定画面 (`TimeSettingScreen`) → [アプリ手動追加画面 (`AddAppScreen`)] → 利用料支払い画面 (`DepositScreen`) → メイン画面 (`MainScreen`) → ロック画面 (`LockScreen`) → 完了画面 (`CompletionScreen`)
    * `TimeSettingScreen` から `AddAppScreen` へ遷移可能。
    * `AddAppScreen` から `TimeSettingScreen` へ戻る。
* **各画面の要素定義**

  * 利用料支払い画面 (`DepositScreen.tsx`):
    *   支払い金額表示 (Text, 例: 5000円)
    *   支払いに関する説明文 (Text, 返金不可である旨など)
    *   支払い実行ボタン (Button, Stripe等の外部連携を想定するが当面はMock処理)
    *   「アプリを手動追加」画面への導線 (例: ヘッダーボタン)。
  * 頭金入力画面：返金希望額＋手数料率表示＋券種選択ドロップダウン
  * 平均利用時間表示画面 (`AverageUsageScreen.tsx`): 
    *   過去30日間の1日あたりの合計平均利用時間を表示。
    *   過去30日間の1日あたりのアプリ別平均利用時間（パッケージ名と時間）を表示。
    *   (この画面は新しい仕様では不要になるか、役割が大幅に変わる可能性があります)
  * 目標時間設定画面 (`TimeSettingScreen.tsx`):
    *   利用履歴のあるアプリと手動追加されたアプリの一覧（アプリ名またはパッケージ名）を表示。
    *   各アプリに対して個別に「現在の1日の使用時間」（分単位）を入力可能にする (これが `users.initialDailyUsageLimit.byApp` に保存される)。**各アプリについて、未設定の場合のみ入力可能とし、一度保存されると以降は変更不可とする。**
    *   各アプリに対して個別に「目標の1日の使用時間」（分単位）を入力可能にする (これが `users.currentLimit.byApp` に保存される)。
    *   「アプリを手動追加」画面への導線 (例: ヘッダーボタン)。
  * **[新規] アプリ手動追加画面 (`AddAppScreen.tsx`)**:
    *   端末にインストールされている起動可能なアプリの一覧を表示 (アプリ名、パッケージ名)。
    *   検索バーによるアプリの絞り込み機能。
    *   各アプリを選択/解除するためのチェックボックス。
    *   選択したアプリを保存するボタン。
  * メイン (`MainScreen.tsx`):
    *   「今日の合計残り利用可能時間」表示 (Text, `users.currentDailyUsageLimit.total` と `usageLogs.usedMinutes` から計算)
    *   「今日の合計許容利用時間」表示 (Text, `users.currentDailyUsageLimit.total`)
    *   当日合計使用量プログレスバー (ProgressBar)
    *   合計使用済み時間/許容時間テキスト表示 (Text)
    *   「アプリ別の状況」表示 (DataTable):
        *   各アプリ名 (Text)
        *   各アプリの「今日の残り利用可能時間」(Text, `users.currentDailyUsageLimit.byApp[pkg]` と `usageLogs.usedMinutesByPackage[pkg]` から計算)
        *   各アプリの「今日の許容利用時間」(Text, `users.currentDailyUsageLimit.byApp[pkg]`)
        *   各アプリの「今日の使用時間」(Text, `usageLogs.usedMinutesByPackage[pkg]`)
  * ロック画面：「アンロック」「退出」ボタン
  * 完了画面：退会／継続ボタン
  * 時間設定画面：
    *   上限時間入力 (TextInput, 1～1440分の整数)
    *   決定ボタン (Button)
* **バリデーションルール**

  * 時間設定は 1分～1440分の整数
  * （支払い画面のバリデーションは、実際の決済手段導入時に定義）
  * 返金希望額はギフト券券種に合わせる
  * アプリごとの目標時間設定は 0分～1440分の整数 (未入力は制限なし)
  * アプリごとの「現在の1日の使用時間」設定は 0分～1440分の整数 (未入力は制限なし、ただし少なくとも1つは0より大きい値を入力) 