import React from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import { signInAnonymously } from '../services/authService';

// TODO: Implement actual login logic
const LoginScreen = () => {
  const handleLogin = async () => {
    const user = await signInAnonymously();
    if (user) {
      // Navigation to HomeScreen is handled by AppNavigator based on auth state
      console.log('Anonymous login successful, user UID:', user.uid);
    } else {
      Alert.alert('Login Failed', 'Could not sign in anonymously.');
    }
  };

  return (
    <View style={styles.container}>
      <Text>Login Screen</Text>
      <Button title="Login (Anonymous)" onPress={handleLogin} />
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

export default LoginScreen; 