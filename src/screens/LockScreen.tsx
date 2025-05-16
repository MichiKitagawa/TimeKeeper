import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { PaperProvider, Card, Title, Paragraph } from 'react-native-paper';

const LockScreen = () => {
  // TODO: アンロック料金の表示ロジック (タスク16)
  const unlockFee = 200; // 仮の料金

  const handleUnlock = () => {
    // TODO: アンロック処理 (タスク17)
    console.log('Unlock pressed');
  };

  const handleExit = () => {
    // TODO: アプリ終了または前の画面に戻るなどの処理
    console.log('Exit pressed');
    // RNExitApp.exitApp(); // 必要に応じて
  };

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
              アンロック料金: {unlockFee}円
            </Paragraph>
          </Card.Content>
          <Card.Actions style={styles.actions}>
            <Button title="アンロック" onPress={handleUnlock} />
            <Button title="退出する" onPress={handleExit} color="red" />
          </Card.Actions>
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
  card: {
    width: '90%',
    maxWidth: 400,
    elevation: 4, // for Android shadow
    shadowColor: '#000', // for iOS shadow
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