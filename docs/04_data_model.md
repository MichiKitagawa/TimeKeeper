# データモデル設計書 (Firebase Firestore)

Firebase Firestoreをデータベースとして使用します。以下は主要なコレクションの構造案です。
個人情報の取り扱いを最小限に抑えるため、ユーザー情報は主にFirebase Authenticationで管理し、Firestoreには必要最低限の情報を格納します。

## コレクション構造

### `users` コレクション

*   ドキュメントID: Firebase AuthenticationのユーザーUID
*   **フィールド**:
    *   `currentLimit`: Number (現在の上限時間、分単位、初回設定後は変更不可になる機能仕様あり)
    *   `depositedAmount`: Number (これまでにデポジットされた総額、参考情報として。課金とは別)
    *   `createdAt`: Timestamp (ユーザーアカウント作成日時)
    *   `lastLoginAt`: Timestamp (最終ログイン日時、任意)
    *   `challengeId`: String (現在参加中のチャレンジID、`challenges`コレクションへの参照)

    *備考: 従来の `name` や `email` はFirebase Authentication側で管理、または匿名認証の場合は不要。アプリ固有でニックネーム等が必要な場合は別途検討するが、原則として個人情報は保持しない。*

### `deposits` コレクション

*   ドキュメントID: 自動生成ID
*   **フィールド**:
    *   `userId`: String (Firebase AuthenticationのユーザーUID、`users`コレクションへの参照)
    *   `refundAmount`: Number (ユーザーが選択した券種額に基づく返金希望額)
    *   `feeRate`: Number (手数料率、例: 0.1)
    *   `chargedAmount`: Number (実際に課金/デポジットされた額、手数料込み)
    *   `status`: String (`pending`, `completed`, `failed`, `refunded` など。初期値は `pending`)
    *   `createdAt`: Timestamp (デポジット処理ドキュメント作成日時、Firestoreサーバータイムスタンプを使用)
    *   `updatedAt`: Timestamp (ステータス等更新日時、Firestoreサーバータイムスタンプを使用)
    *   `transactionId`: String | null (決済システム側のトランザクションID、任意。初期値は `null`)

### `usageLogs` コレクション

*   ドキュメントID: 自動生成ID
*   **フィールド**:
    *   `userId`: String (Firebase AuthenticationのユーザーUID)
    *   `date`: Timestamp (利用日、日付のみで時間は00:00:00 UTCなどを推奨)
    *   `usedMinutes`: Number (その日に使用した分数)
    *   `dailyLimitReached`: Boolean (その日の上限時間に達したか)

### `unlockLogs` コレクション

*   ドキュメントID: 自動生成ID
*   **フィールド**:
    *   `userId`: String (Firebase AuthenticationのユーザーUID)
    *   `date`: Timestamp (ロック解除日)
    *   `unlockFee`: Number (ロック解除にかかった料金)
    *   `previousMultiplier`: Number (前回の課金倍率)
    *   `newMultiplier`: Number (今回の課金後の次の倍率)
    *   `unlockUntil`: Timestamp (この解除によっていつまで利用可能か、特定の時間までか、あるいはその日限りかなど仕様による)
    *   `transactionId`: String (決済システム側のトランザクションID、任意)

### `challenges` コレクション

*   ドキュメントID: 自動生成ID
*   **フィールド**:
    *   `userId`: String (Firebase AuthenticationのユーザーUID)
    *   `initialLimitMinutes`: Number (チャレンジ開始時の1日の上限時間)
    *   `status`: String (`active`, `completed_refund`, `completed_continue`, `failed`)
    *   `startDate`: Timestamp (チャレンジ開始日)
    *   `endDate`: Timestamp (チャレンジ目標終了日、または自動減少により0になった日)
    *   `targetDays`: Number (チャレンジ目標日数、任意)
    *   `remainingDays`: Number (残り日数、Cloud Functionsで毎日更新想定)
    *   `currentDailyLimitMinutes`: Number (現在の1日の上限時間、Cloud Functionsで毎日更新想定)

## データ間の関連

*   各コレクションの `userId` フィールドは、Firebase Authenticationで発行されるユーザーUIDと一致させ、ユーザーごとのデータを紐付けます。
*   `users`コレクションの`challengeId`で現在のチャレンジを紐づけます。

## セキュリティルール

詳細は `docs/08_firebase_architecture_and_security.md` に記載しますが、基本方針として、ユーザーは自身のデータのみ読み書き可能とし、他ユーザーのデータにはアクセスできないように設定します。 