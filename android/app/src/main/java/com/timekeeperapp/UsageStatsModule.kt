package com.timekeeperapp

import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.*
import kotlin.collections.ArrayList

class UsageStatsModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var unlockRequestReceiver: BroadcastReceiver? = null

    override fun getName(): String {
        return "UsageStatsModule"
    }

    override fun initialize() {
        super.initialize()
        setupUnlockRequestReceiver()
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        unregisterUnlockRequestReceiver()
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        if (reactContext.hasActiveCatalystInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } else {
            android.util.Log.w(name, "Catalyst instance not active. Event $eventName not sent.")
        }
    }

    private fun setupUnlockRequestReceiver() {
        if (unlockRequestReceiver == null) {
            unlockRequestReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    if (intent?.action == LockingForegroundService.ACTION_REQUEST_UNLOCK) {
                        val packageName = intent.getStringExtra(LockingForegroundService.EXTRA_PACKAGE_NAME)
                        val params = Arguments.createMap().apply {
                            putString("packageName", packageName)
                        }
                        sendEvent(EVENT_UNLOCK_REQUESTED, params)
                        android.util.Log.d(name, "Sent $EVENT_UNLOCK_REQUESTED for $packageName")
                    }
                }
            }
            LocalBroadcastManager.getInstance(reactContext).registerReceiver(
                unlockRequestReceiver!!,
                IntentFilter(LockingForegroundService.ACTION_REQUEST_UNLOCK)
            )
            android.util.Log.d(name, "Unlock request receiver registered.")
        }
    }

    private fun unregisterUnlockRequestReceiver() {
        unlockRequestReceiver?.let {
            LocalBroadcastManager.getInstance(reactContext).unregisterReceiver(it)
            unlockRequestReceiver = null
            android.util.Log.d(name, "Unlock request receiver unregistered.")
        }
    }

    @ReactMethod
    fun getUsageStats(startTime: Double, endTime: Double, promise: Promise) {
        try {
            val usageStatsManager = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val packageManager = reactApplicationContext.packageManager

            val usageStatsList = usageStatsManager.queryUsageStats(UsageStatsManager.INTERVAL_BEST, startTime.toLong(), endTime.toLong())

            val launchableAppsArray = Arguments.createArray()

            val mainIntent = Intent(Intent.ACTION_MAIN, null)
            mainIntent.addCategory(Intent.CATEGORY_LAUNCHER)
            val resolvableInfos = packageManager.queryIntentActivities(mainIntent, 0)
            val launchableAppPackages = resolvableInfos.map { it.activityInfo.packageName }.toSet()

            if (usageStatsList != null) {
                for (usageStat in usageStatsList) {
                    if (launchableAppPackages.contains(usageStat.packageName) && usageStat.totalTimeInForeground > 0) {
                        try {
                            val appInfo = packageManager.getApplicationInfo(usageStat.packageName, 0)
                            val appName = packageManager.getApplicationLabel(appInfo).toString()

                            val statMap = Arguments.createMap()
                            statMap.putString("packageName", usageStat.packageName)
                            statMap.putString("appName", appName)
                            statMap.putDouble("lastTimeUsed", usageStat.lastTimeUsed.toDouble())
                            statMap.putDouble("totalTimeInForeground", usageStat.totalTimeInForeground.toDouble())
                            launchableAppsArray.pushMap(statMap)
                        } catch (e: PackageManager.NameNotFoundException) {
                            // アプリ情報が取得できない場合はスキップ (アンインストールされた直後など)
                            // Log.e("UsageStatsModule", "App not found: ${usageStat.packageName}", e)
                        }
                    }
                }
            }
            promise.resolve(launchableAppsArray)
        } catch (e: Exception) {
            promise.reject("E_USAGE_STATS_ERROR", "Failed to retrieve usage stats: ${e.localizedMessage}", e)
        }
    }

    @ReactMethod
    fun getForegroundApp(promise: Promise) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP_MR1) { // UsageEventsはAPI 22から
            try {
                val usageStatsManager = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
                var time = System.currentTimeMillis()
                // 直近60秒間程度のイベントを問い合わせる
                var events = usageStatsManager.queryEvents(time - 1000 * 60, time)
                var foregroundApp: String? = null
                val event = android.app.usage.UsageEvents.Event()

                // 既知のランチャーパッケージ名、自身のパッケージ名、パッケージインストーラー
                val excludedPackages = setOf(
                    "com.google.android.apps.nexuslauncher", 
                    reactApplicationContext.packageName,
                    "com.google.android.packageinstaller" // パッケージインストーラーを追加
                )

                var potentialForegroundApps = mutableListOf<String>()

                while (events.hasNextEvent()) {
                    events.getNextEvent(event)
                    if (event.eventType == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND) {
                        // foregroundApp = event.packageName // 直接代入せず、リストに追加
                        if (!excludedPackages.contains(event.packageName)) {
                            potentialForegroundApps.add(event.packageName)
                        }
                    }
                }

                // MOVE_TO_FOREGROUND イベントの中から、除外パッケージ以外で最新のものを取得
                if (potentialForegroundApps.isNotEmpty()) {
                    foregroundApp = potentialForegroundApps.last() // リストの最後の要素が最新のフォアグラウンドアプリ
                }


                if (foregroundApp != null) {
                    android.util.Log.d(name, "Foreground app found by queryEvents (excluding launchers/self): $foregroundApp")
                    promise.resolve(foregroundApp)
                } else {
                    android.util.Log.d(name, "Foreground app not found by queryEvents or was excluded, trying queryUsageStats as fallback.")
                    // フォールバック: queryUsageStatsで直近のアプリを取得
                    time = System.currentTimeMillis()
                    val usageStatsList = usageStatsManager.queryUsageStats(
                        UsageStatsManager.INTERVAL_BEST,
                        time - 1000 * 60,
                        time
                    )

                    if (usageStatsList != null && usageStatsList.isNotEmpty()) {
                        // totalTimeInForeground が MIN_FOREGROUND_TIME_MS 以上で、lastTimeUsed でソート
                        val MIN_FOREGROUND_TIME_MS = 1500L // 例: 1.5秒以上フォアグラウンドだったものを対象 (調整可能)
                        val filteredAndSortedList = usageStatsList
                            .filter { it.totalTimeInForeground >= MIN_FOREGROUND_TIME_MS }
                            .sortedByDescending { it.lastTimeUsed }
                        
                        // 除外パッケージに含まれない最初のアプリを見つける
                        var foundApp: String? = null
                        for (stat in filteredAndSortedList) {
                            if (!excludedPackages.contains(stat.packageName)) {
                                foundApp = stat.packageName
                                break
                            }
                        }

                        if (foundApp != null) {
                            foregroundApp = foundApp
                            android.util.Log.d(name, "Foreground app found by queryUsageStats (INTERVAL_BEST, filtered by time): $foregroundApp")
                            promise.resolve(foregroundApp)
                        } else {
                            android.util.Log.d(name, "No non-excluded usage stats found in fallback after filtering.")
                            // フィルタリングで候補がなくなった場合、フィルタリング前のリストで再度試すか、nullを返す
                            // ここでは一旦、フィルタリング前のリストで再度試すロジックを追加 (より多くのケースを拾うため)
                            val fallbackSortedList = usageStatsList.sortedByDescending { it.lastTimeUsed }
                            var fallbackFoundApp: String? = null
                            for (stat in fallbackSortedList) {
                                if (!excludedPackages.contains(stat.packageName)) {
                                    fallbackFoundApp = stat.packageName
                                    break
                                }
                            }
                            if (fallbackFoundApp != null) {
                                android.util.Log.d(name, "Foreground app found by queryUsageStats (INTERVAL_BEST, no time filter as second fallback): $fallbackFoundApp")
                                promise.resolve(fallbackFoundApp)
                            } else {
                                android.util.Log.d(name, "No non-excluded usage stats found in fallback even without time filter.")
                                promise.resolve(null)
                            }
                        }
                    } else {
                        android.util.Log.d(name, "UsageStatsList is null or empty in fallback (INTERVAL_BEST).")
                        promise.resolve(null)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e(name, "Error in getForegroundApp: ${e.localizedMessage}", e)
                promise.reject("E_GET_FG_APP_ERROR", "Failed to get foreground app: ${e.localizedMessage}", e)
            }
        } else {
            android.util.Log.w(name, "getForegroundApp called on API level < 22")
            promise.resolve(null) // APIレベルが低い場合はnull
        }
    }

    @ReactMethod
    fun getInstalledLaunchableApps(promise: Promise) {
        try {
            val packageManager = reactApplicationContext.packageManager
            val mainIntent = Intent(Intent.ACTION_MAIN, null)
            mainIntent.addCategory(Intent.CATEGORY_LAUNCHER)
            val resolvableInfos = packageManager.queryIntentActivities(mainIntent, 0)

            val appsArray = Arguments.createArray()

            for (resolveInfo in resolvableInfos) {
                val appName = resolveInfo.loadLabel(packageManager).toString()
                val packageName = resolveInfo.activityInfo.packageName

                val appMap = Arguments.createMap()
                appMap.putString("appName", appName)
                appMap.putString("packageName", packageName)
                appsArray.pushMap(appMap)
            }
            promise.resolve(appsArray)
        } catch (e: Exception) {
            promise.reject("E_GET_INSTALLED_APPS_ERROR", "Failed to get installed launchable apps: ${e.localizedMessage}", e)
        }
    }

    @ReactMethod
    fun startLockingService(promise: Promise) {
        try {
            val context = reactApplicationContext
            val serviceIntent = Intent(context, LockingForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_START_LOCK_SERVICE", "Failed to start locking service: ${e.localizedMessage}", e)
        }
    }

    @ReactMethod
    fun stopLockingService(promise: Promise) {
        try {
            val context = reactApplicationContext
            val serviceIntent = Intent(context, LockingForegroundService::class.java)
            context.stopService(serviceIntent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_STOP_LOCK_SERVICE", "Failed to stop locking service: ${e.localizedMessage}", e)
        }
    }

    @ReactMethod
    fun setLockedApps(lockedAppsInfoArray: ReadableArray, promise: Promise) {
        try {
            val context = reactApplicationContext
            val serviceIntent = Intent(context, LockingForegroundService::class.java)
            serviceIntent.action = LockingForegroundService.ACTION_SET_LOCKED_APPS

            val appLockInfoList = ArrayList<Bundle>()
            for (i in 0 until lockedAppsInfoArray.size()) {
                lockedAppsInfoArray.getMap(i)?.let { appInfoMap ->
                    val packageName = appInfoMap.getString("packageName")
                    val limitMinutes = appInfoMap.getInt("limitMinutes")
                    val isTemporarilyUnlocked = if (appInfoMap.hasKey("isTemporarilyUnlocked")) appInfoMap.getBoolean("isTemporarilyUnlocked") else false
                    if (packageName != null) {
                        val bundle = Bundle().apply {
                            putString("packageName", packageName)
                            putInt("limitMinutes", limitMinutes)
                            putBoolean("isTemporarilyUnlocked", isTemporarilyUnlocked)
                        }
                        appLockInfoList.add(bundle)
                    }
                }
            }
            serviceIntent.putParcelableArrayListExtra(LockingForegroundService.EXTRA_LOCKED_APPS_INFO, appLockInfoList)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            android.util.Log.d("UsageStatsModule", "Sent locked apps info to service: $appLockInfoList")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SET_LOCKED_APPS", "Failed to set locked apps info: ${e.localizedMessage}", e)
        }
    }

    companion object {
        const val EVENT_UNLOCK_REQUESTED = "onUnlockRequested"
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // No-op on Android for now
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // No-op on Android for now
    }
} 