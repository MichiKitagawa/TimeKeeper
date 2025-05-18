# TimekeeperApp

TimekeeperAppは、ユーザーが設定した目標時間に基づいて日々の活動時間を管理し、目標達成をサポートするReact Nativeアプリケーションです。Firebaseと連携し、匿名認証、データ保存、プッシュ通知などの機能を提供します。（開発中）

## 概要

このアプリケーションは、利用者が自ら設定した「頭金」と「利用上限時間」に基づいて、日々のスマートフォンの利用時間を意識的にコントロールすることを目的としています。

## 主な機能 (開発予定を含む)

- 匿名認証による簡単な利用開始
- 頭金設定機能
- 利用上限時間設定機能
    - Android: アプリ利用状況に基づき、アプリごとの目標時間を設定可能
- 利用時間の自動減少とモニタリング
    - Android: アプリのフォアグラウンド利用時間を自動で記録・集計
    - 日次および過去30日間の平均利用時間を表示（合計およびアプリごと）
- 設定時間を超えた場合のロック機能
- ロック解除のための課金機能
- チャレンジ完了時のリワード（Amazonギフト券発行など）

## 技術スタック

- React Native
- Firebase (Authentication, Firestore, Cloud Functions, etc.)
- TypeScript
- React Native Paper (UIコンポーネント)
- `@brighthustle/react-native-usage-stats-manager` (Androidアプリ利用状況取得)

## 前提条件

開発を開始する前に、[React Native - Setting up the development environment](https://reactnative.dev/docs/environment-setup) に従って、お使いの環境がReact Native開発に対応していることを確認してください。

## Firebase 設定

このプロジェクトはFirebaseを使用します。以下の設定が完了していることを確認してください。

1.  Firebaseコンソールでプロジェクトを作成します。
2.  AndroidアプリをFirebaseプロジェクトに追加します。
    - パッケージ名は `com.timekeeperapp` です。
3.  `google-services.json` ファイルをダウンロードし、プロジェクトの `/android/app/` ディレクトリに配置します。
4.  iOSアプリをFirebaseプロジェクトに追加します (iOS開発を行う場合)。
    - バンドルIDは `com.timekeeperapp` です。
5.  `GoogleService-Info.plist` ファイルをダウンロードし、プロジェクトの `/ios/プロジェクト名/` ディレクトリに配置します (Xcode経由で追加)。

## 開発の始め方

1.  **リポジトリをクローンします:**
    ```sh
    git clone <repository-url>
    cd TimekeeperApp
    ```

2.  **依存関係をインストールします:**
    ```sh
    npm install
    # または
    # yarn install
    ```

3.  **Metroサーバーを起動します:**
    新しいターミナルを開き、プロジェクトルートで以下のコマンドを実行します。
    ```sh
    npm start
    # または
    # yarn start
    ```

4.  **アプリケーションをビルド・実行します:**
    Metroサーバーを実行したまま、別のターミナルを開き、プロジェクトルートで以下のコマンドを実行します。

    **Android:**
    ```sh
    npm run android
    # または
    # yarn android
    ```

    **iOS (macOSのみ):**
    ```sh
    cd ios
    pod install
    cd ..
    npm run ios
    # または
    # yarn ios
    ```

    もしビルドや実行で問題が発生した場合は、React Nativeの公式ドキュメントの[トラブルシューティング](https://reactnative.dev/docs/troubleshooting)を参照してください。

## ドキュメント

プロジェクトに関する詳細なドキュメントは以下の通りです。

- **[開発タスク一覧 (tasks.md)](tasks.md):** 現在の開発タスクと進捗状況を管理しています。
- **[各種設計ドキュメントの目次・概要 (ドキュメント.md)](ドキュメント.md):** プロダクト要件、機能仕様、API設計、データモデルなど、主要な設計ドキュメントの概要と、`docs/`ディレクトリ内の各詳細ドキュメントへのポインタを提供します。
- **`docs/` ディレクトリ:**
    - `01_prd.md`: プロダクト要件定義書
    - `02_fsd.md`: 機能仕様書
    - `03_api_specification.md`: API仕様書
    - `04_data_model.md`: データモデル設計書
    - `05_ui_wireframes.md`: UIワイヤーフレーム & フロー図
    - `06_test_plan.md`: テスト計画書
    - `07_coding_standards_and_react_native_structure.md`: コーディング規約とReact Nativeの構成
    - `08_firebase_architecture_and_security.md`: Firebaseアーキテクチャとセキュリティ

これらのドキュメントは、開発を進める上で重要な情報源となります。適宜参照・更新してください。

## 貢献

貢献を歓迎します！バグ報告や機能提案は、Issueを通じてお願いします。プルリクエストも歓迎です。

## ライセンス

このプロジェクトは MIT ライセンス のもとで公開されています。詳細については、`LICENSE` ファイルを参照してください（もし存在すれば）。存在しない場合は、以下のライセンスが適用されます。

MIT License

Copyright (c) [year] [fullname]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
