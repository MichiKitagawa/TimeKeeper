# Firebaseアーキテクチャとセキュリティ

本ドキュメントでは、TimekeeperアプリケーションにおけるFirebaseのアーキテクチャ、各サービスの利用方針、およびセキュリティ設定について詳述します。
AIに開発を委任する際も、本ドキュメントに記載された方針とセキュリティルールを前提とするよう指示してください。

## 1. Firebaseプロジェクト構成

*   **主要サービス**:
    *   Firebase Authentication: ユーザー認証（匿名認証、メール/パスワード認証など）
    *   Firebase Firestore: プライマリデータベース（NoSQLドキュメントデータベース）
    *   Firebase Cloud Functions: バックエンドロジック（日次バッチ処理、複雑な書き込みオペレーションなど）
    *   Firebase Crashlytics: クラッシュレポートと分析
    *   Firebase Performance Monitoring: アプリのパフォーマンス監視
    *   (オプション) Firebase Remote Config: アプリ設定の遠隔管理
    *   (オプション) Firebase Cloud Messaging (FCM): プッシュ通知 (将来的な拡張用)
*   **リージョン**: Firestore、Cloud Functionsのリージョンは、ユーザーの主要な所在地を考慮して選択します（例: `asia-northeast1` (東京)）。一度設定すると変更できないため、慎重に決定します。

## 2. Firebase Authentication

*   **認証方法の優先順位**:
    1.  **匿名認証**: ユーザー登録のハードルを下げ、手軽に利用開始できるようにします。ユーザーが明示的にアカウント連携を選択した場合に、他の認証方法にリンクすることを検討します。
    2.  **メール/パスワード認証**: 標準的な認証方法。パスワードリセット機能も提供されます。
    3.  (オプション) **電話番号認証 (SMS)**: 必要に応じて。
    4.  (オプション) **ソーシャルログイン (Google, Appleなど)**: ユーザーの利便性向上のために検討。ただし、連携する情報範囲は最小限にします。
*   **ユーザーステータス管理**: ユーザーの有効/無効状態はFirebase Authentication側で管理します。
*   **トークン管理**: Firebase SDKが自動的にIDトークンの発行と更新を行いますが、Cloud Functionsなどでバックエンドからユーザーを検証する際は、クライアントから送信されたIDトークンを検証します。
*   **個人情報**: Authenticationで収集する情報は、選択した認証プロバイダが必要とする最低限の情報（メールアドレスなど）に留めます。追加のユーザープロファイル情報はFirestoreの `users` コレクションに保存しますが、これも必要最小限にします (後述)。

## 3. Firebase Firestore

*   **データモデル**: 詳細なコレクション構造は `docs/04_data_model.md` を参照してください。ここでの設計は、個人情報を極力排除し、アプリケーションの機能に必要なデータのみを保持することを基本方針とします。
*   **ルールとインデックス**:
    *   **セキュリティルール**: Firestoreの最も重要な機能の一つです。後述する「4. Firebaseセキュリティルール」に従って厳格に設定します。
    *   **インデックス**: Firestoreは基本的なクエリに対して自動でインデックスを作成しますが、複合クエリや特定の順序付けを行う場合は、手動で複合インデックスを作成する必要があります。Firebaseコンソールの指示に従い、必要なインデックスを事前に定義します。
*   **データの非正規化**: NoSQLデータベースの特性上、読み取り効率を上げるためにある程度のデータ重複（非正規化）を許容する場合があります。ただし、更新時の整合性担保の複雑さを考慮し、慎重に設計します。
    *   例: `challenges` ドキュメントに `userId` を持たせるなど。
*   **サブコレクション**: ドキュメント内にサブコレクションを作成することで、関連データを階層的に管理できます。例えば、`users/{userId}/notifications` のような構造も可能です。ただし、クエリの複雑さやセキュリティルールとの兼ね合いを考慮します。

## 4. Firebaseセキュリティルール (Firestore)

Firebase Firestoreのセキュリティルールは、データベースへのアクセスを制御するための非常に強力な仕組みです。**デフォルトでは全ての読み書きが拒否されるか、あるいは許可されている場合があるため、開発初期に必ず適切なルールを設定する必要があります。**

*   **基本方針**:
    *   **最小権限の原則**: 必要最小限の権限のみを許可します。
    *   **認証必須**: 原則として、全てのデータアクセスは認証されたユーザーのみに許可します (`request.auth != null`)。
    *   **ユーザーデータの分離**: ユーザーは自身のデータにのみアクセス可能とし、他ユーザーのデータにはアクセスできないようにします (`request.auth.uid == resource.data.userId` や `request.auth.uid == userIdInPath`)。
    *   **入力値のバリデーション**: 書き込み操作時には、データの型、必須フィールド、値の範囲などをルール内で検証します (`request.resource.data` を使用)。
    *   **Cloud Functionsからのアクセス**: バックエンド処理 (Cloud Functions) からのアクセスは、サービスアカウントを通じて行われるため、セキュリティルール上は管理者権限として扱われるか、あるいは特定の関数からの呼び出しであることを示すカスタムクレーム等を利用して制御します。

*   **記述場所**: Firebaseコンソールの Firestore > Rules タブで編集・デプロイします。開発中はエミュレータスイートでローカルテストを推奨します。

*   **ルール例 (抜粋)**:

    ```firestore
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {

        // users コレクション
        match /users/{userId} {
          // 自分のドキュメントのみ読み書き可能
          allow read, write: if request.auth != null && request.auth.uid == userId;
          // より詳細なフィールドごとのバリデーション（作成時、更新時など）は、
          // 各機能の実装に応じて firestore.rules ファイルに直接追加・更新します。
        }

        // deposits コレクション
        match /deposits/{depositId} {
          // 認証されたユーザーは、自分のuserIdを持つドキュメントを読み取り可能
          allow read: if request.auth != null && request.auth.uid == resource.data.userId;
          // 認証されたユーザーは、自分のuserIdで、指定された条件でドキュメントを作成可能
          allow create: if request.auth != null
                          && request.auth.uid == request.resource.data.userId
                          && request.resource.data.refundAmount is number && request.resource.data.refundAmount > 0
                          && request.resource.data.feeRate is number && request.resource.data.feeRate >= 0 && request.resource.data.feeRate < 1
                          && request.resource.data.chargedAmount is number && request.resource.data.chargedAmount >= request.resource.data.refundAmount
                          && request.resource.data.status == 'pending'
                          && request.resource.data.createdAt == request.time
                          && request.resource.data.updatedAt == request.time
                          && (request.resource.data.transactionId == null || request.resource.data.transactionId is string);
          // 更新と削除は現時点では許可しない (必要に応じて変更)
          allow update, delete: if false;
        }

        // usageLogs コレクション
        match /usageLogs/{logId} {
          allow read: if request.auth != null && request.auth.uid == resource.data.userId;
          allow create: if request.auth != null && request.auth.uid == request.resource.data.userId
                          && request.resource.data.date is timestamp
                          && request.resource.data.usedMinutes is number && request.resource.data.usedMinutes >= 0;
          // usageLogs は追記のみで更新・削除は不可とするのが一般的
          allow update, delete: if false;
        }

        // challenges コレクション
        match /challenges/{challengeId} {
            allow read: if request.auth != null && request.auth.uid == resource.data.userId;
            allow create: if request.auth != null && request.auth.uid == request.resource.data.userId
                            // 作成時のバリデーション (initialLimitMinutes, startDateなど)
                            && request.resource.data.initialLimitMinutes is number
                            && request.resource.data.status == 'active';
            // 更新はCloud Functions (例: remainingDays, currentDailyLimitMinutesの更新) と
            // ユーザー自身による状態変更 (例: completed_refund) を分けて定義
            // allow update: if (/* Cloud Functionからの更新条件 */) || (request.auth.uid == resource.data.userId && /* ユーザーによる更新条件 */);
        }

        // ルールのヘルパー関数 (例)
        // function isOwner(userId) {
        //   return request.auth != null && request.auth.uid == userId;
        // }
      }
    }
    ```
    *注意: 上記はあくまで基本的な例です。実際のアプリケーションの要件に合わせてより詳細かつ厳密なルールを設定する必要があります。特にフィールド単位のバリデーションは、各コレクションのデータ整合性を保つために重要です。*

## 5. Firebase Cloud Functions

*   **用途**:
    *   **定期実行処理**: 毎日1分ずつ時間を自動減少させるバッチ処理など (`onSchedule` トリガー)。
    *   **Firestoreトリガー**: Firestoreの特定ドキュメントが作成・更新・削除された際に実行する処理（例: `deposits`作成時にユーザーの`depositedAmount`を更新する、`usageLogs`作成時に`challenges`の残り時間を更新する）。
    *   **HTTPSトリガー**: クライアントから直接呼び出すAPIエンドポイント（例: AmazonギフトAPIとの連携、複雑な決済処理）。この場合、Firebase Authenticationと連携し、IDトークンで認証・認可を行います。
    *   **Callable Functions**: クライアントから型安全に呼び出せるHTTPSトリガーの一種。Firebase SDK経由で呼び出し、認証情報も自動的に連携されます。
*   **言語**: Node.js (TypeScriptを推奨) または Python。
*   **デプロイと管理**: Firebase CLIを使用してデプロイ・管理します。
*   **セキュリティ**: Cloud Functionsの実行権限 (IAM) は最小限にします。HTTPSトリガーの場合、不正な呼び出しを防ぐために認証を必須とします。
*   **冪等性**: 特にFirestoreトリガーやバッチ処理では、処理が複数回実行されても問題が発生しないように冪等性を考慮して設計します。

## 6. AmazonギフトAPI連携

*   `docs/03_api_specification.md` に記載の `POST /gift-api/v1/issue` は、直接クライアントから呼び出すのではなく、**Cloud Functions (HTTPSトリガーまたはCallable Function) を介して呼び出す**ことを強く推奨します。
*   **理由**: APIキーなどの機密情報をクライアントに含めることを避けるため、また、サーバーサイドでリクエストの正当性チェックや流量制御を行うためです。
*   **フロー**: クライアントアプリ → Firebase Cloud Function → AmazonギフトAPI
*   Cloud Function内では、APIキーを環境変数として安全に管理します。

## 7. 全体的なセキュリティ考慮事項

*   **クライアントサイドの機密情報**: Firebaseの設定ファイル (`google-services.json` や `GoogleService-Info.plist`) はリポジトリに含めて問題ありませんが、APIキーやその他の秘匿すべき情報はクライアントコードにハードコードせず、Cloud Functionsの環境変数などで管理します。
*   **エラーログと監視**: Firebase CrashlyticsやPerformance Monitoringを活用し、アプリの健全性を監視します。エラーログに個人情報が含まれないように注意します。
*   **依存関係の脆弱性**: `npm audit` や `yarn audit` を定期的に実行し、使用しているライブラリの脆弱性を確認・更新します。
*   **Firebase Emulator Suite**: 開発中は、Auth, Firestore, FunctionsなどをローカルでエミュレートできるFirebase Emulator Suiteの利用を強く推奨します。これにより、実際の課金やリソース消費なしに安全かつ迅速に開発・テストが行えます。

本ドキュメントは、アプリケーションの成長と共に継続的に見直され、更新されるべきです。 