import { SafeAreaView, StyleSheet, Text } from 'react-native';

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>프로필</Text>
      <Text style={styles.subtitle}>로그인 연동 전 임시 화면입니다.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { marginTop: 8, color: '#6B7280' },
});
