# データモデル設計書 (Firebase Firestore)

Firebase Firestoreをデータベースとして使用します。以下は主要なコレクションの構造案です。
個人情報の取り扱いを最小限に抑えるため、ユーザー情報は主にFirebase Authenticationで管理し、Firestoreには必要最低限の情報を格納します。

## コレクション構造

### `users` コレクション

*   ドキュメントID: Firebase AuthenticationのユーザーUID
*   **フィールド**:
    *   `currentLimit`: Number (ユーザーが初回に設定した1日の利用上限時間、分単位。原則変更不可)
    *   `challengeId`: String (現在アクティブなチャレンジのID、`challenges`コレクションへの参照)
    *   `createdAt`: Timestamp (ユーザードキュメント作成日時、Firestoreサーバータイムスタンプを使用)
    *   `updatedAt`: Timestamp (ユーザードキュメント更新日時、Firestoreサーバータイムスタンプを使用)
    *   `lastLoginAt`: Timestamp (最終ログイン日時、任意)
    *   `lastActiveDate`: Timestamp (ユーザーが最後にアプリをアクティブに使用した日時)
    *   `paymentStatus`: String ("paid", "requires_repayment" など。初回は支払い待ち状態を示す値)
    *   `paymentId`: String (現在有効な支払いのID、`payments`コレクションへの参照、任意)

    *備考: `depositedAmount` は削除。アプリ固有でニックネーム等が必要な場合は別途検討するが、原則として個人情報は保持しない。*

### `payments` コレクション (旧 `deposits` コレクション)

*   ドキュメントID: 自動生成ID
*   **フィールド**:
    *   `userId`: String (Firebase AuthenticationのユーザーUID、`users`コレクションへの参照)
    *   `amount`: Number (支払われた固定額、例: 5000)
    *   `paymentDate`: Timestamp (支払い処理日時、Firestoreサーバータイムスタンプを使用)
    *   `status`: String (`completed`, `failed` など。)
    *   `createdAt`: Timestamp (ドキュメント作成日時)
    *   `updatedAt`: Timestamp (ステータス等更新日時)
    *   `transactionId`: String | null (決済システム側のトランザクションID、任意。初期値は `null`)

    *備考: `refundAmount`, `feeRate`, `chargedAmount` (手数料込みの変動額) は削除。固定額のため `amount` で管理。*

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
    *   `initialLimitMinutes`: Number (チャレンジ開始時の1日の上限時間、ユーザーが設定)
    *   `currentDailyLimitMinutes`: Number (現在の1日の上限時間。初期値は `initialLimitMinutes`。Cloud Functionsで毎日更新想定)
    *   `status`: String (`active`, `completed_reset`, `completed_continue`, `failed`。初期値は `active`)
        *備考: `completed_refund` は新しい仕様では意味が変わるため `completed_reset` などに名称変更を検討。*
    *   `startDate`: Timestamp (チャレンジ開始日時、Firestoreサーバータイムスタンプを使用)
    *   `endDate`: Timestamp | null (チャレンジ目標終了日、または自動減少により0になった日。初期状態では `null` もしくは未設定)
    *   `targetDays`: Number | null (チャレンジ目標日数、任意。初期状態では `null` もしくは未設定)
    *   `remainingDays`: Number | null (残り日数、Cloud Functionsで毎日更新想定。初期状態では `null` もしくは未設定)

## データ間の関連

*   各コレクションの `userId` フィールドは、Firebase Authenticationで発行されるユーザーUIDと一致させ、ユーザーごとのデータを紐付けます。
*   `users`コレクションの`challengeId`で現在のチャレンジを紐づけます。
*   `users`コレクションの`paymentId`で最新の有効な支払いを紐づけることができます。

## セキュリティルール

詳細は `docs/08_firebase_architecture_and_security.md` に記載しますが、基本方針として、ユーザーは自身のデータのみ読み書き可能とし、他ユーザーのデータにはアクセスできないように設定します。 