import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { createRequest } from "@/src/actions/customerActions";
import { LABELS } from "@/src/constants/labels";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { Screen } from "@/src/components/Screen";

export default function NewRequestScreen() {
  const router = useRouter();
  const uid = useAuthUid();

  const [title, setTitle] = useState("거실 수리");
  const [description, setDescription] = useState("방수/도배 관련 작업이 필요합니다.");
  const [location, setLocation] = useState("서울 강남구");
  const [budget, setBudget] = useState("150000");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!uid) {
      setErrorMessage(LABELS.messages.loginRequired);
      return;
    }

    setStatus("saving");
    setErrorMessage(null);

    try {
      const requestId = await createRequest({
        title,
        description,
        location,
        budget: Number(budget) || 0,
        customerId: uid,
      });
      setStatus("idle");
      router.replace(`/requests/${requestId}`);
    } catch (error) {
      console.error("[customer][request] create error", error);
      setStatus("error");
      setErrorMessage("요청을 등록하지 못했습니다. 다시 시도해 주세요.");
      Alert.alert("요청 등록 실패", "다시 시도해 주세요.");
    }
  };

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>요청 등록</Text>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <View style={styles.form}>
        <Text style={styles.label}>제목</Text>
        <TextInput value={title} onChangeText={setTitle} style={styles.input} />

        <Text style={styles.label}>설명</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.textArea]}
          multiline
        />

        <Text style={styles.label}>지역</Text>
        <TextInput value={location} onChangeText={setLocation} style={styles.input} />

        <Text style={styles.label}>예산</Text>
        <TextInput
          value={budget}
          onChangeText={setBudget}
          style={styles.input}
          keyboardType="numeric"
        />

        <TouchableOpacity
          style={[styles.button, status === "saving" && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={status === "saving"}
        >
          <Text style={styles.buttonText}>{status === "saving" ? "등록 중..." : "등록하기"}</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  form: { gap: 12 },
  label: { fontWeight: "600" },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: { minHeight: 90, textAlignVertical: "top" },
  button: {
    marginTop: 8,
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    opacity: 1,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontWeight: "600" },
  error: { color: "#DC2626", marginBottom: 8 },
});
