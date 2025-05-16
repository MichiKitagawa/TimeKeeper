import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator, Alert, BackHandler } from 'react-native';
import { PaperProvider, Card, Title, Paragraph } from 'react-native-paper';
import { useNavigation, StackActions } from '@react-navigation/native';
import { useAuth } from '../navigation/AppNavigator';
import { calculateUnlockDetails, processUnlock } from '../services/unlockService';
import { AppStackParamList } from '../navigation/AppNavigator';
import { StackNavigationProp } from '@react-navigation/stack';

type LockScreenNavigationProp = StackNavigationProp<AppStackParamList, 'LockScreen'>;

const LockScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation<LockScreenNavigationProp>();

  const [unlockFee, setUnlockFee] = useState(0);
  const [previousMultiplier, setPreviousMultiplier] = useState(0);
  const [newMultiplier, setNewMultiplier] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (user) {
      const fetchUnlockFee = async () => {
        setIsLoading(true);
        try {
          const details = await calculateUnlockDetails(user.uid);
          setUnlockFee(details.fee);
          setPreviousMultiplier(details.previousMultiplierToSave);
          setNewMultiplier(details.newMultiplierToSave);
        } catch (error) {
          console.error("Failed to calculate unlock fee: ", error);
          Alert.alert("エラー", "料金情報の取得に失敗しました。");
          setUnlockFee(200);
        }
        setIsLoading(false);
      };
      fetchUnlockFee();
    }
  }, [user]);

  const handleUnlock = async () => {
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      await processUnlock(user.uid, unlockFee, previousMultiplier, newMultiplier);
      Alert.alert("アンロック成功", "ロックが解除されました。アプリをお楽しみください。");
      navigation.dispatch(StackActions.replace('Home'));
    } catch (error) {
      console.error("Unlock process failed: ", error);
      Alert.alert("アンロック失敗", "処理中にエラーが発生しました。もう一度お試しください。");
    }
    setIsProcessing(false);
  };

  const handleExit = () => {
    Alert.alert(
      "アプリの終了",
      "アプリを終了しますか？",
      [
        { text: "キャンセル", style: "cancel" },
        { text: "終了する", onPress: () => BackHandler.exitApp() }
      ]
    );
  };

  if (isLoading) {
    return (
      <PaperProvider>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" />
          <Text>料金情報を読み込み中...</Text>
        </View>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider>
      <View style={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.title}>ロックされています</Title>
            <Paragraph style={styles.message}>
              本日の利用上限時間を超えました。
            </Paragraph>
            <Paragraph style={styles.feeText}>
              アンロック料金: {Math.round(unlockFee)}円
            </Paragraph>
          </Card.Content>
          <Card.Actions style={styles.actions}>
            <Button title="アンロックする" onPress={handleUnlock} disabled={isProcessing || isLoading} />
            <Button title="アプリを終了" onPress={handleExit} color="red" disabled={isProcessing} />
          </Card.Actions>
          {isProcessing && <ActivityIndicator style={{ marginTop: 10 }}/>}
        </Card>
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
    backgroundColor: '#f5f5f5',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '90%',
    maxWidth: 400,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  title: {
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 24,
    fontWeight: 'bold',
  },
  message: {
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 16,
  },
  feeText: {
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 18,
    fontWeight: 'bold',
    color: 'green',
  },
  actions: {
    justifyContent: 'space-around',
    paddingBottom: 10,
  },
});

export default LockScreen; 