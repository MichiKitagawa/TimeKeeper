import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

const AuthLoadingScreen = () => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text>Loading...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AuthLoadingScreen; 