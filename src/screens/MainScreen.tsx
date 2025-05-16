import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ProgressBar, Provider as PaperProvider, Card, Title, Paragraph } from 'react-native-paper';
// import firestore from '@react-native-firebase/firestore'; // 次のステップでFirebase連携時に使用
// import auth from '@react-native-firebase/auth'; // 次のステップでFirebase連携時に使用
// import { useAuth } from '../navigation/AppNavigator'; // 必要に応じて

// ダミーデータ（後でFirestoreから取得するように変更）
const dummyUserData = {
  currentLimitMinutes: 120, // 1日の上限時間（分）
};

const dummyChallengeData = {
  // initialLimitMinutes: 120,
  currentDailyLimitMinutes: 120, // 今日の利用可能時間（分） - これはCloud Functionsが更新する想定
  // remainingDays: 10, // 残り日数
};

// 仮の当日使用時間（後でトラッキングするように変更）
const DUMMY_TODAY_USAGE_MINUTES = 45;

const MainScreen = () => {
  // const { user } = useAuth(); // Firebase連携時に使用
  const [remainingTime, setRemainingTime] = useState<number>(dummyChallengeData.currentDailyLimitMinutes - DUMMY_TODAY_USAGE_MINUTES);
  const [progress, setProgress] = useState<number>(0);
  const [dailyLimit, setDailyLimit] = useState<number>(dummyChallengeData.currentDailyLimitMinutes);

  useEffect(() => {
    // ダミーデータに基づいてプログレスバーを計算
    // 本来はFirestoreから取得したcurrentDailyLimitMinutesと、実際にトラッキングした当日使用時間で計算
    const todayUsageMinutes = DUMMY_TODAY_USAGE_MINUTES;
    const currentDailyLimit = dummyChallengeData.currentDailyLimitMinutes;
    
    if (currentDailyLimit > 0) {
      setProgress(todayUsageMinutes / currentDailyLimit);
    } else {
      setProgress(1); // 0分なら使い切ったとみなす
    }
    setRemainingTime(Math.max(0, currentDailyLimit - todayUsageMinutes));
    setDailyLimit(currentDailyLimit);

    // Firestoreからのデータ取得ロジックは後でここに追加
    // if (user) {
    //   const userId = user.uid;
    //   // usersコレクションからchallengeIdを取得
    //   // challengesコレクションから該当チャレンジのデータを取得 (リスナー設定)
    //   // usageLogsコレクションから当日の使用時間を取得 (リスナー設定)
    // }
  }, []); // userを依存配列に追加予定

  return (
    <PaperProvider>
      <View style={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.title}>今日の残り時間</Title>
            <Text style={styles.timeText}>
              {Math.floor(remainingTime / 60)} 時間 {remainingTime % 60} 分
            </Text>
            <Paragraph>今日の目標: {dailyLimit}分</Paragraph>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Title>今日の使用状況</Title>
            <ProgressBar progress={progress} style={styles.progressBar} />
            <Text style={styles.progressText}>
              {DUMMY_TODAY_USAGE_MINUTES}分 / {dailyLimit}分 使用済み
            </Text>
          </Card.Content>
        </Card>
        
        {/* 今後の機能追加用スペース */}
        {/* 例: 履歴表示ボタン、設定変更ボタンなど */}
      </View>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  card: {
    marginBottom: 16,
    elevation: 2, // Android用の影
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#6200ee',
  },
  progressBar: {
    height: 20,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  progressText: {
    textAlign: 'right',
    fontSize: 12,
    color: 'gray'
  },
});

export default MainScreen; 