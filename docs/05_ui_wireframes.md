このドキュメントには、各画面のレイアウトラフ（手書きモック or 簡易図）および画面遷移のフローチャートを記載します。

現時点ではプレースホルダーです。デザインツールやドローイングツールで作成後、ここに画像を埋め込むか、マークダウンで記述してください。

## 頭金入力画面 (`DepositScreen.tsx`)

*   UI実装済み。詳細は `src/screens/DepositScreen.tsx` を参照してください。
    *   主要コンポーネント: `Menu` (券種選択), `TextInput` (返金希望額), `Text` (手数料関連情報), `Button` (確認)
    *   デザインはReact Native Paperのデフォルトスタイルをベースとしています。

## 時間設定画面 (`TimeSettingScreen.tsx`)

*   UI実装済み。詳細は `src/screens/TimeSettingScreen.tsx` を参照してください。
    *   主要コンポーネント: `TextInput` (各アプリの目標時間入力), `Button` (決定), ヘッダーに「アプリ手動追加」画面への遷移ボタン。
    *   利用履歴のあるアプリと手動追加されたアプリのリストが表示されます。
    *   入力値は0～1440分の整数でバリデーションされます。
    *   デザインはReact Native Paperのデフォルトスタイルをベースとしています。

## [新規] アプリ手動追加画面 (`AddAppScreen.tsx`)

*   UI実装済み。詳細は `src/screens/AddAppScreen.tsx` を参照してください。
    *   主要コンポーネント: `Searchbar`, `FlatList` (アプリ一覧), `Checkbox` (アプリ選択), `Button` (保存)。
    *   インストールされている起動可能なアプリの一覧が表示されます。
    *   デザインはReact Native Paperのデフォルトスタイルをベースとしています。

## メイン画面 (`MainScreen.tsx`)

*   UI実装済み (ダミーデータ使用)。詳細は `src/screens/MainScreen.tsx` を参照してください。
    *   主要コンポーネント: `Card`, `Title`, `Text` (残り時間、目標時間), `ProgressBar` (使用状況), `Paragraph`
    *   デザインはReact Native Paperのデフォルトスタイルをベースとしています。 

## 更新履歴

*   YYYY/MM/DD: 新規作成
*   YYYY/MM/DD: 画面遷移図をユーザーフロー改善に合わせて更新 (ログイン → 平均利用時間表示 → 目標時間設定 → 支払い → メイン)
*   **YYYY/MM/DD (今回の更新):**
    *   `AverageUsageScreen`: 「カテゴリ別平均」から「アプリ別平均（パッケージ名表示）」にUI変更。
    *   `TimeSettingScreen`: 「合計目標時間」の入力欄を廃止し、「利用実績のあるアプリ一覧」に対して個別に目標時間を設定するUIに大幅変更。
    *   **YYYY/MM/DD (今回の更新):**
        *   `TimeSettingScreen`: 手動で追加されたアプリも表示するように変更。ヘッダーに `AddAppScreen` への遷移ボタンを追加。
        *   `AddAppScreen`: 新規追加。インストール済みアプリ一覧から監視対象を選択・保存する機能。
        *   (注: 上記変更に伴うワイヤーフレーム図およびフロー図の更新が必要です。)

各画面のレイアウトラフ（手書きモック or 簡易図）
画面遷移のフローチャート 