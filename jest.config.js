module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['./jest-setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?@?react-native|@react-native-community|@react-navigation|@react-native-firebase)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    'src/services/__tests__/depositService.test.ts',
  ],
};
