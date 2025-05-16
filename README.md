# TimekeeperApp

TimekeeperAppは、ユーザーが設定した目標時間に基づいて日々の活動時間を管理し、目標達成をサポートするReact Nativeアプリケーションです。Firebaseと連携し、匿名認証、データ保存、プッシュ通知などの機能を提供します。（開発中）

## 概要

このアプリケーションは、利用者が自ら設定した「頭金」と「利用上限時間」に基づいて、日々のスマートフォンの利用時間を意識的にコントロールすることを目的としています。

## 主な機能 (開発予定を含む)

- 匿名認証による簡単な利用開始
- 頭金設定機能
- 利用上限時間設定機能
- 利用時間の自動減少とモニタリング
- 設定時間を超えた場合のロック機能
- ロック解除のための課金機能
- チャレンジ完了時のリワード（Amazonギフト券発行など）

## 技術スタック

- React Native
- Firebase (Authentication, Firestore, Cloud Functions, etc.)
- TypeScript

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

- [開発タスク一覧 (tasks.md)](tasks.md)
- [各種設計ドキュメント (docs/)](docs/)

## 貢献

貢献を歓迎します！バグ報告や機能提案は、Issueを通じてお願いします。プルリクエストも歓迎です。

## ライセンス

(TBD: プロジェクトのライセンスをここに記載します)
