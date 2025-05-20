import { NativeModules, Platform } from 'react-native';

const { UsageStatsModule } = NativeModules as {
    UsageStatsModule: {
        getUsageStats: (startTime: number, endTime: number) => Promise<UsageStat[]>;
        getForegroundApp: () => Promise<string | null>;
        getInstalledLaunchableApps: () => Promise<InstalledAppInfo[]>;
    }
};

export interface UsageStat {
  packageName: string;
  appName: string;
  lastTimeUsed: number;
  totalTimeInForeground: number;
}

export interface InstalledAppInfo {
  packageName: string;
  appName: string;
}

export const getNativeUsageStats = async (startTime: number, endTime: number): Promise<UsageStat[]> => {
  if (Platform.OS !== 'android') {
    console.warn('getNativeUsageStats is only supported on Android');
    return [];
  }

  try {
    const stats = await UsageStatsModule.getUsageStats(startTime, endTime);
    return stats;
  } catch (error) {
    console.error('Error getting native usage stats:', error);
    return [];
  }
};

export const getNativeForegroundApp = async (): Promise<string | null> => {
  if (Platform.OS !== 'android') {
    console.warn('getNativeForegroundApp is only supported on Android');
    return null;
  }
  try {
    return await UsageStatsModule.getForegroundApp();
  } catch (error) {
    console.error('Error getting native foreground app:', error);
    return null;
  }
};

export const getNativeInstalledLaunchableApps = async (): Promise<InstalledAppInfo[]> => {
  if (Platform.OS !== 'android') {
    console.warn('getNativeInstalledLaunchableApps is only supported on Android');
    return [];
  }
  try {
    const apps = await UsageStatsModule.getInstalledLaunchableApps();
    return apps;
  } catch (error) {
    console.error('Error getting native installed launchable apps:', error);
    return [];
  }
}; 