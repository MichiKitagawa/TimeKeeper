// 現時点では具体的なバリデーションルールが不明なため、ファイルのみ作成します。
// 今後、ギフト券券種や数値範囲などのバリデーションをここに追加します。

export const validateRefundAmount = (amount: string, voucherValue?: number): string | null => {
  if (!amount) {
    return '返金希望額を入力してください。';
  }
  const numericAmount = parseInt(amount, 10);
  if (isNaN(numericAmount)) {
    return '数値を入力してください。';
  }
  if (numericAmount <= 0) {
    return '0より大きい値を入力してください。';
  }
  if (voucherValue && numericAmount !== voucherValue) {
    return `選択された券種 (${voucherValue}円) と一致させてください。`;
  }
  return null;
}; 