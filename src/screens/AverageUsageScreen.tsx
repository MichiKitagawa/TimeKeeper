import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AppStackParamList } from '../navigation/AppNavigator';
import { getAverageUsageMinutesLast30Days, AverageUsage, AppUsage } from '../services/usageTrackingService';
import { markAverageUsageTimeFetched } from '../services/userService';
import { useAuth } from '../navigation/AppNavigator';

type AverageUsageScreenNavigationProp = StackNavigationProp<
  AppStackParamList,
  'AverageUsageScreen'
>;

type Props = {
  navigation: AverageUsageScreenNavigationProp;
};

const AverageUsageScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [averageUsage, setAverageUsage] = useState<AverageUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAverageUsage = async () => {
      if (!user) {
        setError('ユーザー情報が取得できませんでした。');
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const usageData = await getAverageUsageMinutesLast30Days();
        setAverageUsage(usageData);
        await markAverageUsageTimeFetched(user.uid);
        setError(null);
      } catch (e: any) {
        console.error('Failed to fetch average usage or mark as fetched:', e);
        setError('平均利用時間の取得または状態の更新に失敗しました。');
        setAverageUsage(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAverageUsage();
  }, [user]);

  const handleNext = () => {
    navigation.navigate('TimeSettingScreen');
  };

  const formatTime = (minutes: number): string => {
    if (typeof minutes !== 'number' || isNaN(minutes)) {
      return 'データなし';
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours > 0 ? hours + '時間' : ''}${mins}分`;
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>平均利用時間を計算中...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>過去30日間の平均利用時間</Text>
      {error && <Text style={styles.errorText}>{error}</Text>}
      
      {averageUsage && !error && (
        <View style={styles.usageContainer}>
          <Text style={styles.totalUsageTitle}>合計平均:</Text>
          <Text style={styles.usageText}>{formatTime(averageUsage.total)}</Text>
          
          {averageUsage.byApp && Object.keys(averageUsage.byApp).length > 0 && (
            <View style={styles.byAppContainer}>
              <Text style={styles.byAppTitle}>アプリ別平均:</Text>
              {Object.entries(averageUsage.byApp).map(([packageName, time]) => (
                <View key={packageName} style={styles.appUsageItem}>
                  <Text style={styles.appName}>{packageName}:</Text>
                  <Text style={styles.appTime}>{formatTime(time)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
      
      <Text style={styles.description}>
        こちらが過去30日間のあなたの1日あたりの平均スマートフォン利用時間です。
        この数値を参考に、目標時間を設定しましょう。
      </Text>
      <Button title="目標時間を設定する" onPress={handleNext} disabled={isLoading || !!error || !averageUsage} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  usageContainer: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  totalUsageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555',
    marginBottom: 5,
  },
  usageText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4A90E2',
    marginBottom: 15,
  },
  byAppContainer: {
    marginTop: 15,
    width: '100%',
  },
  byAppTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555',
    marginBottom: 10,
    textAlign: 'center',
  },
  appUsageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    width: '100%',
  },
  appName: {
    fontSize: 16,
    color: '#333',
  },
  appTime: {
    fontSize: 16,
    fontWeight: '500',
    color: '#4A90E2',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
    paddingHorizontal: 10,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    marginBottom: 15,
    textAlign: 'center'
  },
});

export default AverageUsageScreen; 