import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Button, Card, Title, Paragraph, ActivityIndicator, Provider as PaperProvider } from 'react-native-paper';
import { useNavigation, StackActions, RouteProp, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AppStackParamList, useAuth } from '../navigation/AppNavigator';
import { requestRefund, continueChallenge } from '../services/userService';

type CompletionScreenNavigationProp = StackNavigationProp<
  AppStackParamList,
  'CompletionScreen'
>;

type CompletionScreenRouteProp = RouteProp<AppStackParamList, 'CompletionScreen'>;

const CompletionScreen = () => {
  const navigation = useNavigation<CompletionScreenNavigationProp>();
  const route = useRoute<CompletionScreenRouteProp>();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const challengeId = route.params?.challengeId;

  const handleRefund = async () => {
    if (!user || !challengeId) {
      Alert.alert("エラー", "ユーザー情報またはチャレンジ情報が取得できませんでした。");
      return;
    }
    setIsLoading(true);
    try {
      const result = await requestRefund(user.uid, challengeId);
      Alert.alert("返金処理完了", `ギフトコード: ${result.giftCode}\n金額: ${result.amount}円\nメッセージ: ${result.message || 'なし'}`);
      navigation.dispatch(StackActions.replace('AuthLoading'));
    } catch (error) {
      console.error("Refund error:", error);
      Alert.alert("エラー", error instanceof Error ? error.message : "返金処理に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!user || !challengeId) {
      Alert.alert("エラー", "ユーザー情報またはチャレンジ情報が取得できませんでした。");
      return;
    }
    setIsLoading(true);
    try {
      await continueChallenge(user.uid, challengeId);
      Alert.alert("継続処理完了", "新しいチャレンジを開始するために、頭金設定画面へ移動します。");
      navigation.dispatch(StackActions.replace('Deposit'));
    } catch (error) {
      console.error("Continue error:", error);
      Alert.alert("エラー", error instanceof Error ? error.message : "継続処理に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  if (!challengeId) {
    return (
      <PaperProvider>
        <View style={styles.centered}>
          <Title>エラー</Title>
          <Paragraph>チャレンジ情報が見つかりません。</Paragraph>
          <Button onPress={() => navigation.goBack()}>戻る</Button>
        </View>
      </PaperProvider>
    );
  }

  if (isLoading) {
    return (
      <PaperProvider>
        <View style={styles.centered}>
          <ActivityIndicator animating={true} size="large" />
        </View>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider>
      <View style={styles.container}>
        <Card>
          <Card.Content>
            <Title style={styles.title}>チャレンジ完了！</Title>
            <Paragraph style={styles.paragraph}>
              おめでとうございます！現在のチャレンジを完了しました。
              今後について選択してください。
            </Paragraph>
            <Button
              mode="contained"
              onPress={handleRefund}
              style={styles.button}
              disabled={isLoading}
              icon="cash-refund"
            >
              退会して返金手続きへ
            </Button>
            <Button
              mode="outlined"
              onPress={handleContinue}
              style={styles.button}
              disabled={isLoading}
              icon="restart"
            >
              新しいチャレンジを始める
            </Button>
          </Card.Content>
        </Card>
      </View>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  paragraph: {
    textAlign: 'center',
    marginBottom: 24,
    fontSize: 16,
  },
  button: {
    marginTop: 10,
    paddingVertical: 8,
  },
});

export default CompletionScreen; 