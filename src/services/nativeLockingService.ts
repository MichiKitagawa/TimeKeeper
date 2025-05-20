import { NativeModules } from 'react-native';

// アプリロック情報をネイティブモジュールに渡すための型
export interface AppLockInfoNative {
  packageName: string;
  limitMinutes: number;
  isTemporarilyUnlocked?: boolean;
}

interface UsageStatsModuleType {
  startLockingService: () => Promise<boolean>;
  stopLockingService: () => Promise<boolean>;
  setLockedApps: (lockedAppsInfoArray: AppLockInfoNative[]) => Promise<boolean>; // 型定義を AppLockInfoNative[] に変更
  // 既存の他のメソッドがあればここに追加
  getInstalledLaunchableApps: () => Promise<Array<{ appName: string; packageName: string }>>;
  getUsageStats: (startTime: number, endTime: number) => Promise<any>; // 適切な型に変更してください
  getForegroundApp: () => Promise<string | null>;
}

const { UsageStatsModule } = NativeModules as { UsageStatsModule: UsageStatsModuleType };

export const startLockingService = async (): Promise<boolean> => {
  try {
    return await UsageStatsModule.startLockingService();
  } catch (error) {
    console.error('Failed to start locking service:', error);
    return false;
  }
};

export const stopLockingService = async (): Promise<boolean> => {
  try {
    return await UsageStatsModule.stopLockingService();
  } catch (error) {
    console.error('Failed to stop locking service:', error);
    return false;
  }
};

// setLockedApps の引数の型を AppLockInfoNative[] に変更
export const setLockedApps = async (lockedAppsInfoArray: AppLockInfoNative[]): Promise<boolean> => {
  try {
    return await UsageStatsModule.setLockedApps(lockedAppsInfoArray);
  } catch (error) {
    console.error('Failed to set locked apps info:', error); // エラーメッセージも修正
    return false;
  }
};

// 必要に応じて既存のメソッドもエクスポート
export const getInstalledLaunchableApps = async (): Promise<Array<{ appName: string; packageName: string }>> => {
  try {
    return await UsageStatsModule.getInstalledLaunchableApps();
  } catch (error) {
    console.error('Failed to get installed launchable apps:', error);
    return [];
  }
}; 