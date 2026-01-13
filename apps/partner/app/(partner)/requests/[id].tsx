import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function PartnerRequestDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // 더미 상세 (나중에 Firestore로 교체)
  const request = useMemo(() => {
    return {
      id,
      title: "요청 상세",
      location: "서울 강서구",
      budget: 120000,
      detail: "고객 요청 내용이 여기에 표시됩니다(더미).",
      createdAtText: "2026. 1. 13. 오전 9:00",
    };
  }, [id]);

  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const onSubmit = () => {
    // ✅ 여기서는 저장/연동 없음. “제출된 척”만.
    setSubmitMsg("견적이 제출되었습니다(껍데기 모드).");
    setTimeout(() => router.push("/(partner)/chats/room_001"), 600);

  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>요청 상세</Text>

      <View style={styles.card}>
        <Text style={styles.title}>{request.title}</Text>
        <Text style={styles.meta}>{request.location}</Text>
        <Text style={styles.meta}>예산: {request.budget.toLocaleString()}원</Text>
        <Text style={styles.meta}>{request.createdAtText}</Text>
        <Text style={styles.detail}>{request.detail}</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>견적 금액</Text>
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder="예: 120000"
          keyboardType="number-pad"
          style={styles.input}
        />

        <Text style={styles.label}>메시지</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="고객에게 보낼 메시지"
          style={[styles.input, { height: 110, textAlignVertical: "top" }]}
          multiline
        />

        {submitMsg ? <Text style={styles.ok}>{submitMsg}</Text> : null}

        <TouchableOpacity style={styles.btn} onPress={onSubmit}>
          <Text style={styles.btnText}>견적 제출</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={() => router.back()}>
          <Text style={styles.linkText}>뒤로</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  header: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
  },
  title: { fontSize: 16, fontWeight: "700" },
  meta: { marginTop: 6, color: "#6B7280" },
  detail: { marginTop: 10, color: "#111827", lineHeight: 20 },
  form: { marginTop: 14 },
  label: { marginTop: 10, fontWeight: "700", color: "#111827" },
  input: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ok: { marginTop: 10, color: "#16A34A", fontWeight: "700" },
  btn: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  linkBtn: { marginTop: 10, alignItems: "center" },
  linkText: { color: "#111827", fontWeight: "700" },
});
