import { SafeAreaView, StyleSheet, Text } from "react-native";

export default function PartnerProfileTab() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>프로필</Text>
      <Text style={styles.desc}>지금은 껍데기 화면입니다.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  title: { fontSize: 20, fontWeight: "700" },
  desc: { marginTop: 10, color: "#6B7280" },
});
