package com.timekeeperapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import android.widget.Button
import androidx.core.app.NotificationCompat
import java.util.ArrayList
import com.timekeeperapp.R
import androidx.localbroadcastmanager.content.LocalBroadcastManager

// アプリのロック情報を保持するデータクラス
data class AppLockInfo(
    val packageName: String,
    val limitMinutes: Int,
    var usageTodayMinutes: Long = 0L,
    var isTemporarilyUnlocked: Boolean = false // 一時的なアンロック状態
) // 当日利用時間を追加

class LockingForegroundService : Service() {

    private val CHANNEL_ID = "TimekeeperLockingServiceChannel"
    private val NOTIFICATION_ID = 1
    private val OVERLAY_UPDATE_INTERVAL_MS = 1000L // 1秒ごとに確認
    private val USAGE_AGGREGATION_INTERVAL_MS = 60000L // 1分ごとに利用時間を集計 (仮)

    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    private val handler = Handler(Looper.getMainLooper())
    private var lockedAppInfoList: List<AppLockInfo> = emptyList()
    private var currentForegroundApp: String? = null
    private lateinit var usageStatsManager: UsageStatsManager

    companion object {
        const val ACTION_SET_LOCKED_APPS = "com.timekeeperapp.ACTION_SET_LOCKED_APPS"
        const val EXTRA_LOCKED_APPS_INFO = "EXTRA_LOCKED_APPS_INFO"
        const val ACTION_REQUEST_UNLOCK = "com.timekeeperapp.ACTION_REQUEST_UNLOCK" // アンロック要求用アクション
        const val EXTRA_PACKAGE_NAME = "EXTRA_PACKAGE_NAME" // パッケージ名用キー
    }

    private val overlayRunnable = object : Runnable {
        override fun run() {
            updateForegroundApp()
            checkAndManageOverlay()
            handler.postDelayed(this, OVERLAY_UPDATE_INTERVAL_MS)
        }
    }

    // 利用時間集計用のRunnable (定期的に実行)
    private val usageAggregationRunnable = object : Runnable {
        override fun run() {
            aggregateUsageTimes()
            handler.postDelayed(this, USAGE_AGGREGATION_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("TimekeeperApp")
            .setContentText("アプリの利用状況を監視しています。")
            .setSmallIcon(R.mipmap.ic_launcher) // TODO: 適切なアイコンに置き換えてください
            .build()

        startForeground(NOTIFICATION_ID, notification)

        if (intent?.action == ACTION_SET_LOCKED_APPS) {
            // BundleのArrayListとして受け取る
            val appInfoBundles = intent.getParcelableArrayListExtra<Bundle>(EXTRA_LOCKED_APPS_INFO)
            if (appInfoBundles != null) {
                lockedAppInfoList = appInfoBundles.mapNotNull { bundle ->
                    val packageName = bundle.getString("packageName")
                    val limitMinutes = bundle.getInt("limitMinutes", Int.MAX_VALUE) // デフォルトは制限なしに近い値
                    val isTemporarilyUnlocked = bundle.getBoolean("isTemporarilyUnlocked", false) // 追加
                    if (packageName != null) {
                        // 既存の情報を維持しつつ更新
                        val existingInfo = lockedAppInfoList.find { it.packageName == packageName }
                        AppLockInfo(
                            packageName,
                            limitMinutes,
                            existingInfo?.usageTodayMinutes ?: 0L, // 利用時間は維持
                            isTemporarilyUnlocked // 新しいアンロック状態で更新
                        )
                    } else {
                        null
                    }
                }
                android.util.Log.d("LockingService", "Locked apps info updated: $lockedAppInfoList")
                // 新しいリストが設定されたら、利用時間も再集計する（これは既存の挙動）
                // aggregateUsageTimes() // onStartCommandの最後で呼ばれるのでここでは不要かも
            }
        }

        handler.removeCallbacks(overlayRunnable)
        handler.post(overlayRunnable)
        
        handler.removeCallbacks(usageAggregationRunnable)
        handler.post(usageAggregationRunnable) // 利用時間集計も開始

        return START_STICKY
    }

    private fun updateForegroundApp() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            val time = System.currentTimeMillis()
            val events = usageStatsManager.queryEvents(time - OVERLAY_UPDATE_INTERVAL_MS * 2, time) // 直近のイベントを取得
            var latestForegroundEventTimestamp: Long = -1L // 修正後: 最新イベントのタイムスタンプ
            var foregroundAppPackageName: String? = null    // 修正後: 最新イベントのパッケージ名
            val currentEvent = UsageEvents.Event()          // 修正後: ループ内で使用するイベントオブジェクト

            while (events.hasNextEvent()) {
                events.getNextEvent(currentEvent) // currentEventの内容がここで更新される
                if (currentEvent.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                    if (currentEvent.timeStamp > latestForegroundEventTimestamp) {
                        latestForegroundEventTimestamp = currentEvent.timeStamp
                        foregroundAppPackageName = currentEvent.packageName
                    }
                }
            }
            currentForegroundApp = foregroundAppPackageName // 修正後
        } else {
            // 古いAndroidバージョン向けの代替手段 (より信頼性が低い)
            // ActivityManager.getRunningTasks(1) などを使うが、近年は制限が多い
            currentForegroundApp = null
        }
    }

    // 各ロック対象アプリの今日の利用時間を集計する
    private fun aggregateUsageTimes() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) {
            return // UsageStatsManagerが使えない場合は何もしない
        }
        val calendar = java.util.Calendar.getInstance()
        val currentDayOfYear = calendar.get(java.util.Calendar.DAY_OF_YEAR)

        // 日付が変わったかどうかのチェック（簡易的な前回日付保持）
        // より堅牢にするにはSharedPreferencesなどに保存する
        val sharedPrefs = getSharedPreferences("LockingServicePrefs", Context.MODE_PRIVATE)
        val lastAggregationDayOfYear = sharedPrefs.getInt("lastAggregationDayOfYear", -1)

        if (currentDayOfYear != lastAggregationDayOfYear) {
            android.util.Log.d("LockingService", "Date changed. Resetting temporary unlock states.")
            lockedAppInfoList.forEach { appInfo ->
                appInfo.isTemporarilyUnlocked = false
                appInfo.usageTodayMinutes = 0L // 利用時間もリセット
            }
            with(sharedPrefs.edit()) {
                putInt("lastAggregationDayOfYear", currentDayOfYear)
                apply()
            }
        }

        calendar.set(java.util.Calendar.HOUR_OF_DAY, 0)
        calendar.set(java.util.Calendar.MINUTE, 0)
        calendar.set(java.util.Calendar.SECOND, 0)
        calendar.set(java.util.Calendar.MILLISECOND, 0)
        val startTime = calendar.timeInMillis
        val endTime = System.currentTimeMillis()

        lockedAppInfoList.forEach { appInfo ->
            try {
                val usageStats = usageStatsManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, endTime)
                val appStat = usageStats?.find { it.packageName == appInfo.packageName }
                appInfo.usageTodayMinutes = (appStat?.totalTimeInForeground ?: 0L) / (1000 * 60) // ミリ秒から分へ
                // android.util.Log.d("LockingService", "Usage for ${appInfo.packageName}: ${appInfo.usageTodayMinutes} min")
            } catch (e: Exception) {
                android.util.Log.e("LockingService", "Error aggregating usage for ${appInfo.packageName}", e)
            }
        }
    }

    private fun checkAndManageOverlay() {
        val foregroundAppPackage = currentForegroundApp
        if (foregroundAppPackage != null && foregroundAppPackage != packageName) {
            val lockedApp = lockedAppInfoList.find { it.packageName == foregroundAppPackage }
            if (lockedApp != null) {
                // 一時的にアンロックされている場合はオーバーレイを表示しない
                if (lockedApp.isTemporarilyUnlocked) {
                    hideOverlay()
                    return
                }
                // 利用時間が設定された上限を超えているか確認 (0分は即ロック扱い)
                if (lockedApp.limitMinutes == 0 || lockedApp.usageTodayMinutes > lockedApp.limitMinutes) {
                    showOverlay(lockedApp.packageName, lockedApp.limitMinutes)
                    return
                }
            }
        }
        hideOverlay()
    }

    private fun showOverlay(lockedAppPackage: String, limitMinutes: Int) {
        if (overlayView == null) {
            val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
            overlayView = inflater.inflate(R.layout.lock_overlay, null)

            val messageView = overlayView?.findViewById<TextView>(R.id.lock_message)
            val unlockButton = overlayView?.findViewById<Button>(R.id.unlock_button)
            val closeAppButton = overlayView?.findViewById<Button>(R.id.close_app_button)

            val message = if (limitMinutes == 0) {
                "$lockedAppPackage は本日利用できません。"
            } else {
                "$lockedAppPackage は利用上限 (${limitMinutes}分) に達しました。"
            }
            messageView?.text = message
            // TODO: アンロック料金を動的に設定 (例: XX円の部分)
            unlockButton?.text = "アンロックする"

            unlockButton?.setOnClickListener {
                // LocalBroadcast を送信してアンロック処理を依頼
                val intent = Intent(ACTION_REQUEST_UNLOCK).apply {
                    putExtra(EXTRA_PACKAGE_NAME, lockedAppPackage)
                }
                LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
                android.util.Log.d("LockingService", "Unlock request broadcast sent for $lockedAppPackage")
                hideOverlay() // オーバーレイを一旦隠す
            }

            closeAppButton?.setOnClickListener {
                // ホーム画面に戻ることで、ロックされているアプリを閉じることを試みる
                val homeIntent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(homeIntent)
                hideOverlay() // オーバーレイを隠す
            }

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    WindowManager.LayoutParams.TYPE_PHONE
                },
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            )
            params.gravity = Gravity.CENTER

            try {
                windowManager.addView(overlayView, params)
            } catch (e: Exception) {
                android.util.Log.e("LockingService", "Error adding overlay view", e)
                overlayView = null
            }
        } else {
            // 既に表示されている場合、メッセージやボタンテキストを更新 (必要に応じて)
            val messageView = overlayView?.findViewById<TextView>(R.id.lock_message)
            val unlockButton = overlayView?.findViewById<Button>(R.id.unlock_button)
            val currentMessage = if (limitMinutes == 0) {
                "$lockedAppPackage は本日利用できません。"
            } else {
                "$lockedAppPackage は利用上限 (${limitMinutes}分) に達しました。"
            }
            messageView?.text = currentMessage
            // unlockButton?.text = "アンロックする (YY円)" // 料金再計算など
        }
    }

    private fun hideOverlay() {
        if (overlayView != null) {
            try {
                windowManager.removeView(overlayView)
            } catch (e: Exception) {
                android.util.Log.e("LockingService", "Error removing overlay view", e)
            }
            overlayView = null
        }
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(overlayRunnable)
        handler.removeCallbacks(usageAggregationRunnable) // 集計も停止
        hideOverlay()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Timekeeper Locking Service Channel",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }
} 