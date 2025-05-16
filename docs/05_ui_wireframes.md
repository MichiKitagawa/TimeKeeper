このドキュメントには、各画面のレイアウトラフ（手書きモック or 簡易図）および画面遷移のフローチャートを記載します。

現時点ではプレースホルダーです。デザインツールやドローイングツールで作成後、ここに画像を埋め込むか、マークダウンで記述してください。

## 頭金入力画面 (`DepositScreen.tsx`)

*   UI実装済み。詳細は `src/screens/DepositScreen.tsx` を参照してください。
    *   主要コンポーネント: `Menu` (券種選択), `TextInput` (返金希望額), `Text` (手数料関連情報), `Button` (確認)
    *   デザインはReact Native Paperのデフォルトスタイルをベースとしています。

## 時間設定画面 (`TimeSettingScreen.tsx`)

*   UI実装済み。詳細は `src/screens/TimeSettingScreen.tsx` を参照してください。
    *   主要コンポーネント: `TextInput` (上限時間入力), `Button` (決定)
    *   入力値は1～1440分の整数でバリデーションされます。
    *   デザインはReact Native Paperのデフォルトスタイルをベースとしています。 