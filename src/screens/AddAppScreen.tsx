import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Appbar, Button, Card, Checkbox, Searchbar, Text, useTheme } from 'react-native-paper';
import { getNativeInstalledLaunchableApps, InstalledAppInfo } from '../services/nativeUsageStats';
import { addManuallyAddedApp, getUserDocument } from '../services/userService';
import auth from '@react-native-firebase/auth'; // firebase/authを直接インポート

interface AppItem extends InstalledAppInfo {
  id: string; // FlatListのkeyExtractor用
  selected: boolean;
}

const AddAppScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const currentUser = auth().currentUser; // auth().currentUserを直接使用
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [manuallyAddedPackages, setManuallyAddedPackages] = useState<string[]>([]);

  const fetchInstalledApps = useCallback(async () => {
    setLoading(true);
    try {
      const installedApps = await getNativeInstalledLaunchableApps();
      let userDoc;
      if (currentUser) {
        userDoc = await getUserDocument(currentUser.uid);
      }
      const currentManuallyAdded = userDoc?.manuallyAddedApps || [];
      setManuallyAddedPackages(currentManuallyAdded.map((app:any) => app.packageName));

      setApps(
        installedApps.map((app) => ({
          ...app,
          id: app.packageName, // packageNameをidとして使用
          selected: currentManuallyAdded.some((addedApp: any) => addedApp.packageName === app.packageName),
        })).sort((a, b) => a.appName.localeCompare(b.appName)) // ABC順にソート
      );
    } catch (error) {
      console.error("Failed to fetch installed apps:", error);
      Alert.alert("エラー", "インストール済みアプリの取得に失敗しました。");
    }
    setLoading(false);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) { // currentUserが存在しない場合は処理を中断
      Alert.alert("エラー", "ユーザーがログインしていません。ログイン画面に戻ります。");
      // ここでログイン画面への遷移処理などを追加することも検討
      navigation.navigate('Login'); // LoginScreenの存在を仮定
      return;
    }
    fetchInstalledApps();
  }, [fetchInstalledApps, currentUser, navigation]);

  const handleToggleSelect = (packageName: string) => {
    setApps((prevApps) =>
      prevApps.map((app) =>
        app.packageName === packageName ? { ...app, selected: !app.selected } : app
      )
    );
  };

  const handleSaveChanges = async () => {
    if (!currentUser) {
      Alert.alert("エラー", "ユーザー情報が見つかりません。");
      return;
    }
    setSaving(true);
    const selectedAppsToSave = apps
      .filter(app => app.selected)
      .map(({ appName, packageName }) => ({ appName, packageName })); // 保存する情報を整形

    try {
      // userServiceに新しい関数を追加してFirestoreに保存
      await addManuallyAddedApp(currentUser.uid, selectedAppsToSave);
      Alert.alert("成功", "選択したアプリを保存しました。");
      navigation.goBack();
    } catch (error) {
      console.error("Failed to save selected apps:", error);
      Alert.alert("エラー", "アプリの保存に失敗しました。");
    }
    setSaving(false);
  };

  const filteredApps = apps.filter((app) =>
    app.appName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderItem = ({ item }: { item: AppItem }) => (
    <Card style={styles.card}>
      <Card.Title 
        title={item.appName} 
        subtitle={item.packageName} 
        right={(props) => (
            <Checkbox
                {...props}
                status={item.selected ? 'checked' : 'unchecked'}
                onPress={() => handleToggleSelect(item.packageName)}
            />
        )}
      />
    </Card>
  );

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator animating={true} size="large" />
        <Text style={styles.loadingText}>アプリ情報を読み込んでいます...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="監視アプリを手動追加" />
        <Appbar.Action icon="content-save" onPress={handleSaveChanges} disabled={saving} />
      </Appbar.Header>
      <Searchbar
        placeholder="アプリ名で検索"
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchbar}
      />
      {filteredApps.length === 0 && !loading && (
        <View style={styles.centeredContainer}>
            <Text>表示できるアプリが見つかりません。</Text>
            {searchQuery !== '' && <Text>検索条件を変えてお試しください。</Text>}
        </View>
      )}
      <FlatList
        data={filteredApps}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
      />
      {saving && (
        <View style={styles.savingOverlay}>
            <ActivityIndicator animating={true} size="large" color={theme.colors.surface} />
            <Text style={{color: theme.colors.surface, marginTop: 10}}>保存中...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
  },
  searchbar: {
    margin: 8,
  },
  listContent: {
    paddingBottom: 80, // 保存ボタンとの重なりを避ける
  },
  card: {
    marginHorizontal: 8,
    marginVertical: 4,
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  }
});

export default AddAppScreen; 