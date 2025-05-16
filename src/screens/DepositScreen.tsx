import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Button, Text, Provider as PaperProvider, ActivityIndicator } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { processPayment } from '../services/paymentService';
import type { AppStackParamList } from '../navigation/AppNavigator';

const FIXED_PAYMENT_AMOUNT_DISPLAY = "5,000円";
const PAYMENT_DESCRIPTION = "アプリの全機能を利用するためには、初回利用料が必要です。この支払いは返金されません。";

const DepositScreen = () => {
  const navigation = useNavigation<StackNavigationProp<AppStackParamList, 'Deposit'>>();
  const [isLoading, setIsLoading] = useState(false);

  const handlePayment = async () => {
    setIsLoading(true);
    try {
      await processPayment();
      Alert.alert('支払い完了', '利用料の支払い処理が完了しました。時間設定に進みます。');
      navigation.navigate('TimeSettingScreen');
    } catch (error: any) {
      console.error('支払い処理エラー:', error);
      Alert.alert('支払いエラー', error.message || '支払いの処理に失敗しました。しばらくしてから再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PaperProvider>
      <View style={styles.container}>
        <Text style={styles.title}>利用料支払い</Text>

        <Text style={styles.label}>お支払い金額:</Text>
        <Text style={styles.amount}>{FIXED_PAYMENT_AMOUNT_DISPLAY}</Text>

        <Text style={styles.description}>{PAYMENT_DESCRIPTION}</Text>

        {isLoading ? (
          <ActivityIndicator animating={true} size="large" style={styles.loader} />
        ) : (
          <Button 
            mode="contained" 
            onPress={handlePayment} 
            style={styles.button}
          >
            支払う
          </Button>
        )}
      </View>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: '#333',
  },
  label: {
    fontSize: 18,
    color: '#555',
    marginBottom: 8,
    textAlign: 'center',
  },
  amount: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 24,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
    lineHeight: 24,
  },
  button: {
    marginTop: 20,
    paddingVertical: 8,
  },
  loader: {
    marginTop: 20,
  }
});

export default DepositScreen; 