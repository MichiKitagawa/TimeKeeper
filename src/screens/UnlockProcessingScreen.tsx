import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, ActivityIndicator, Provider as PaperProvider, Button } from 'react-native-paper';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { AppStackParamList } from '../navigation/AppNavigator';
import * as nativeLockingService from '../services/nativeLockingService';
import type { AppLockInfoNative } from '../services/nativeLockingService';
import { getUserDocument } from '../services/userService';
import auth from '@react-native-firebase/auth';

type UnlockProcessingScreenRouteProp = RouteProp<AppStackParamList, 'UnlockProcessingScreen'>;
type UnlockProcessingScreenNavigationProp = StackNavigationProp<AppStackParamList, 'UnlockProcessingScreen'>;

const UnlockProcessingScreen = () => {
  const route = useRoute<UnlockProcessingScreenRouteProp>();
  const navigation = useNavigation<UnlockProcessingScreenNavigationProp>();
  const { packageName: targetPackageName, limitMinutes: targetLimitMinutes } = route.params || {};
  const currentUser = auth().currentUser;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlockApp = async () => {
      if (!currentUser) {
        setError("ユーザーが認証されていません。");
        setIsLoading(false);
        return;
      }
      if (!targetPackageName) {
        setError("アンロック対象のアプリが指定されていません。");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const userDoc = await getUserDocument(currentUser.uid);
        if (!userDoc) {
          setError("ユーザーデータが見つかりません。");
          setIsLoading(false);
          return;
        }

        const currentLockedApps = userDoc.lockedApps || [];
        const currentLimitsByApp = userDoc.currentDailyUsageLimit?.byApp || {};

        const lockedAppsInfoForNative: AppLockInfoNative[] = currentLockedApps.map(pkg => {
          const isTarget = pkg === targetPackageName;
          return {
            packageName: pkg,
            limitMinutes: isTarget ? targetLimitMinutes : (currentLimitsByApp[pkg] ?? 0),
            isTemporarilyUnlocked: isTarget
          };
        });

        if (!currentLockedApps.includes(targetPackageName)) {
            lockedAppsInfoForNative.push({
                packageName: targetPackageName,
                limitMinutes: targetLimitMinutes,
                isTemporarilyUnlocked: true,
            });
        }

        console.log(`Attempting to unlock ${targetPackageName} with limit ${targetLimitMinutes}. Data sent to native: `, lockedAppsInfoForNative);

        const success = await nativeLockingService.setLockedApps(lockedAppsInfoForNative);
        if (success) {
          Alert.alert("成功", `${targetPackageName} が一時的にアンロックされました。アプリはまもなく利用可能になります。`);
          setTimeout(() => {
            if (navigation.canGoBack()) {
                navigation.goBack();
            } else {
                navigation.replace('Home');
            }
          }, 1000);
        } else {
          setError(`ネイティブサービスへのアンロック情報の送信に失敗しました。パッケージ名: ${targetPackageName}`);
        }
      } catch (e: any) {
        console.error("Unlock processing error:", e);
        setError(`アンロック処理中にエラーが発生しました: ${e.message || '不明なエラー'}`);
      } finally {
        setIsLoading(false);
      }
    };

    unlockApp();
  }, [currentUser, targetPackageName, targetLimitMinutes, navigation]);

  if (isLoading) {
    return (
      <PaperProvider>
        <View style={styles.container}>
          <ActivityIndicator animating={true} size="large" style={styles.indicator} />
          <Text style={styles.text}>
            {targetPackageName ? `${targetPackageName} のアンロック処理中です...` : 'アンロック処理中です...'}
          </Text>
        </View>
      </PaperProvider>
    );
  }

  if (error) {
    return (
      <PaperProvider>
        <View style={styles.container}>
          <Text style={styles.errorText}>エラー</Text>
          <Text style={styles.text}>{error}</Text>
          <Button onPress={() => navigation.goBack()} style={{marginTop: 20}}>戻る</Button>
        </View>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider>
        <View style={styles.container}>
            <Text style={styles.text}>処理完了。画面遷移します...</Text>
        </View>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f0f0f0',
  },
  indicator: {
    marginBottom: 20,
  },
  text: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
  },
  subText: {
    fontSize: 14,
    textAlign: 'center',
    color: 'gray',
  },
});

export default UnlockProcessingScreen; 