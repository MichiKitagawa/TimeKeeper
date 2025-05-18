# データモデル設計書 (Firebase Firestore)

Firebase Firestoreをデータベースとして使用します。以下は主要なコレクションの構造案です。
個人情報の取り扱いを最小限に抑えるため、ユーザー情報は主にFirebase Authenticationで管理し、Firestoreには必要最低限の情報を格納します。

## コレクション構造

### `users` コレクション

ユーザー情報を格納します。

*   `uid` (string): Firebase AuthenticationのユーザーUID (ドキュメントID)
*   `createdAt` (timestamp): ドキュメント作成日時
*   `updatedAt` (timestamp): ドキュメント最終更新日時
*   `lastActiveDate` (timestamp): ユーザーの最終アクティブ日時
*   `paymentStatus` (string): 支払い状況 (`pending`, `paid`, `failed`など)
*   `paymentId` (string, optional): 関連する支払いID
*   `averageUsageTimeFetched` (boolean): 平均利用時間の取得・表示フロー完了フラグ
*   `timeLimitSet` (boolean): 目標時間設定フロー完了フラグ
*   `paymentCompleted` (boolean): 初回支払いフロー完了フラグ
*   `currentChallengeId` (string, optional): 現在進行中のチャレンジID
*   `currentLimit` (object, optional): 現在の目標時間設定
    *   `total` (number, optional): アプリごとの目標時間の合計（分単位）
    *   `byApp` (map, optional): アプリごとの目標時間（分単位）。キーはパッケージ名、値が分数。
        *   例: `{ "com.example.app1": 60, "com.example.app2": 30 }`
*   `preferences` (object, optional): ユーザー設定
    *   `notificationsEnabled` (boolean, optional): 通知設定
    *   `theme` (string, optional): 表示テーマ (`light` or `dark`)

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

日々のアプリ利用時間を記録します。

*   `logId` (string): ログID (ドキュメントID, 自動生成)
*   `userId` (string): ユーザーUID
*   `date` (timestamp): 利用日 (UTCの0時0分0秒)
*   `usedMinutes` (number): その日の合計利用時間（分単位）
*   `usedMinutesByPackage` (map, optional): アプリごとの利用時間（分単位）。キーはパッケージ名、値が分数。
    *   例: `{ "com.example.app1": 45, "com.example.app2": 20 }`
*   `dailyLimitReached` (boolean): その日の目標時間に到達したかどうかのフラグ (現在は未使用、将来的に利用検討)
*   `createdAt` (timestamp): ログ作成日時
*   `updatedAt` (timestamp): ログ最終更新日時

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