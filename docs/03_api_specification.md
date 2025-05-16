* **エンドポイント例**

  * `POST /api/v1/deposit`

    * リクエスト：userId, refundAmount, feeRate
    * レスポンス：transactionId, chargedAmount
  * `GET /api/v1/usage`

    * レスポンス：todayLimit, todayUsed, remainingDays
  * `POST /api/v1/unlock`

    * リクエスト：transactionId
    * レスポンス：unlockUntil
  * `POST /api/v1/complete`

    * リクエスト：transactionId
    * レスポンス：nextAction (`refund` or `continue`) 