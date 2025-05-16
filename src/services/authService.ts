import auth from '@react-native-firebase/auth';

export const signInAnonymously = async () => {
  try {
    const userCredential = await auth().signInAnonymously();
    console.log('User signed in anonymously:', userCredential.user.uid);
    return userCredential.user;
  } catch (error: any) {
    if (error.code === 'auth/operation-not-allowed') {
      console.log('Enable anonymous sign-in in your Firebase console.');
    }
    console.error(error);
    return null;
  }
};

export const signOut = async () => {
  try {
    await auth().signOut();
    console.log('User signed out');
  } catch (error) {
    console.error(error);
  }
}; 