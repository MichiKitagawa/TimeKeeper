import React, { useEffect, useState, useContext } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AppStackParamList } from '../navigation/AppNavigator';
import { getAverageUsageMinutesLast30Days } from '../services/usageTrackingService';
import { markAverageUsageTimeFetched } from '../services/userService';
import { useAuth } from '../navigation/AppNavigator'; // AuthContextからuserを取得するため

type AverageUsageScreenNavigationProp = StackNavigationProp<
  AppStackParamList,
  'AverageUsageScreen'
>;

type Props = {
  navigation: AverageUsageScreenNavigationProp;
};

const AverageUsageScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [averageUsageTime, setAverageUsageTime] = useState<string | null>(null);
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
        const minutes = await getAverageUsageMinutesLast30Days();
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        setAverageUsageTime(`${hours > 0 ? hours + '時間' : ''}${mins}分`);
        await markAverageUsageTimeFetched(user.uid);
        setError(null);
      } catch (e: any) {
        console.error('Failed to fetch average usage or mark as fetched:', e);
        setError('平均利用時間の取得または状態の更新に失敗しました。');
        setAverageUsageTime('取得失敗');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAverageUsage();
  }, [user]);

  const handleNext = () => {
    navigation.navigate('TimeSettingScreen');
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
    <View style={styles.container}>
      <Text style={styles.title}>過去30日間の平均利用時間</Text>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {averageUsageTime && !error && (
        <Text style={styles.usageText}>{averageUsageTime}</Text>
      )}
      <Text style={styles.description}>
        こちらが過去30日間のあなたの1日あたりの平均スマートフォン利用時間です。
        この数値を参考に、目標時間を設定しましょう。
      </Text>
      <Button title="目標時間を設定する" onPress={handleNext} disabled={isLoading || !!error} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  usageText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4A90E2',
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
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