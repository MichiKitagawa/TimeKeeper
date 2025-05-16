import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { TextInput, Button, Text, Provider as PaperProvider, Menu } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { saveDeposit, DepositData } from '../services/depositService';
import type { AppStackParamList } from '../navigation/AppNavigator'; // AppNavigatorから型をインポート

// 仮の券種データ
const voucherOptions = [
  { label: '1,500円券', value: 1500 },
  { label: '3,000円券', value: 3000 },
  { label: '5,000円券', value: 5000 },
  { label: '10,000円券', value: 10000 },
];

const DepositScreen = () => {
  const navigation = useNavigation<StackNavigationProp<AppStackParamList, 'Deposit'>>(); // 型適用と現在のルート名を指定
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [selectedVoucher, setSelectedVoucher] = useState<number | undefined>(undefined);
  const [feeRate] = useState<number>(0.1); // 仮の手数料率 10%
  const [menuVisible, setMenuVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // ローディング状態を追加

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  const handleVoucherSelect = (value: number) => {
    setSelectedVoucher(value);
    setRefundAmount(value.toString());
    closeMenu();
  };

  const calculatedFee = selectedVoucher ? selectedVoucher * feeRate : 0;
  const totalAmount = selectedVoucher ? selectedVoucher + calculatedFee : 0;

  const handleConfirmDeposit = async () => {
    if (!selectedVoucher) {
      Alert.alert('選択エラー', '券種を選択してください。');
      return;
    }
    setIsLoading(true);
    try {
      const depositData: DepositData = {
        refundAmount: selectedVoucher, // selectedVoucherが返金希望額そのもの
        feeRate: feeRate,
        chargedAmount: totalAmount,
      };
      await saveDeposit(depositData);
      Alert.alert('登録完了', '頭金の情報を登録しました。時間設定に進みます。');
      navigation.navigate('TimeSettingScreen'); // 仮のスクリーン名
    } catch (error: any) {
      console.error('頭金登録エラー:', error);
      Alert.alert('登録エラー', error.message || '頭金の登録に失敗しました。しばらくしてから再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PaperProvider>
      <View style={styles.container}>
        <Text style={styles.title}>頭金入力</Text>

        <Menu
          visible={menuVisible}
          onDismiss={closeMenu}
          anchor={<Button onPress={openMenu} mode="outlined">{selectedVoucher ? `${selectedVoucher}円券` : '券種を選択'}</Button>}
        >
          {voucherOptions.map((option) => (
            <Menu.Item
              key={option.value}
              onPress={() => handleVoucherSelect(option.value)}
              title={option.label}
            />
          ))}
        </Menu>

        <TextInput
          label="返金希望額（円）"
          value={refundAmount}
          onChangeText={setRefundAmount}
          keyboardType="numeric"
          style={styles.input}
          disabled // 券種選択に連動するため編集不可
        />

        <Text style={styles.text}>手数料率: {feeRate * 100}%</Text>
        <Text style={styles.text}>手数料: {calculatedFee}円</Text>
        <Text style={styles.text}>お支払い総額: {totalAmount}円</Text>

        <Button 
          mode="contained" 
          onPress={handleConfirmDeposit} 
          style={styles.button}
          disabled={isLoading} // ローディング中は無効化
          loading={isLoading}  // ローディング表示
        >
          {isLoading ? '処理中...' : '確認して進む'}
        </Button>
      </View>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 16,
  },
  text: {
    fontSize: 16,
    marginBottom: 8,
  },
});

export default DepositScreen; 