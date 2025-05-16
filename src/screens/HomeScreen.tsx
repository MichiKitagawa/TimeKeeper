import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { signOut } from '../services/authService';
import { useAuth } from '../navigation/AppNavigator'; // To display user info

// TODO: Implement actual home screen
const HomeScreen = () => {
  const { user } = useAuth();

  const handleLogout = async () => {
    await signOut();
    // Navigation to LoginScreen is handled by AppNavigator based on auth state
  };

  return (
    <View style={styles.container}>
      <Text>Home Screen</Text>
      {user && <Text>Welcome, User UID: {user.uid}</Text>}
      <Button title="Logout" onPress={handleLogout} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    marginBottom: 10,
  }
});

export default HomeScreen; 