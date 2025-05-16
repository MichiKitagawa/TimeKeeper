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

export const validateTimeLimit = (timeLimit: string): string | null => {
  if (!timeLimit) {
    return '上限時間を入力してください。';
  }
  const numericTimeLimit = parseInt(timeLimit, 10);
  if (isNaN(numericTimeLimit)) {
    return '数値を入力してください。';
  }
  if (numericTimeLimit < 1 || numericTimeLimit > 1440) {
    return '上限時間は1分から1440分の間で設定してください。';
  }
  if (!Number.isInteger(numericTimeLimit)) {
    return '整数で入力してください。';
  }
  return null;
}; 