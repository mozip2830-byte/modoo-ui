import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { doc, getDoc } from "firebase/firestore";

import { db } from "@/src/firebase";
import { RequestDoc, QuoteDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { getMyQuote, upsertQuote } from "@/src/actions/partnerActions";
import { ensureChatExists } from "@/src/actions/chatActions";

export default function PartnerRequestDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const partnerId = useAuthUid();
  const requestId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const [request, setRequest] = useState<RequestDoc | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [quote, setQuote] = useState<QuoteDoc | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [message, setMessage] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!requestId) return;
      setLoading(true);
      setRequestError(null);
      try {
        const snap = await getDoc(doc(db, "requests", requestId));
        if (!snap.exists()) {
          setRequest(null);
          setRequestError("Request not found.");
        } else {
          const data = snap.data() as Omit<RequestDoc, "id">;
          setRequest({ id: snap.id, ...data });
        }
      } catch (err) {
        console.error("[partner][request] load error", err);
        setRequestError("Unable to load request.");
      } finally {
        if (mounted) setLoading(false);
      }

      if (partnerId) {
        try {
          const myQuote = await getMyQuote(requestId, partnerId);
          if (myQuote && mounted) {
            setQuote(myQuote);
            setPriceInput(String(myQuote.price));
            setMessage(myQuote.message ?? "");
            setSubmittedNotice("Submitted");
          }
        } catch (err) {
          console.error("[partner][quote] load error", err);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [partnerId, requestId]);

  const handleSubmit = async () => {
    if (!partnerId) {
      setSubmitError("Login required.");
      return;
    }

    if (!requestId) {
      setSubmitError("Missing request ID.");
      return;
    }

    const normalized = priceInput.replace(/,/g, "");
    const price = Number(normalized);
    if (!Number.isFinite(price) || price <= 0) {
      setSubmitError("Enter a valid price.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmittedNotice(null);

    try {
      await upsertQuote(requestId, partnerId, price, message.trim());
      if (request) {
        await ensureChatExists({
          requestId,
          partnerId,
          customerId: request.customerId || "",
        });
      }
      const updated = await getMyQuote(requestId, partnerId);
      setQuote(updated);
      setSubmittedNotice("Submitted");
    } catch (err: any) {
      console.error("[partner][quote] submit error", err);
      setSubmitError(err?.message ?? "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Detail</Text>
        <View style={{ width: 52 }} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.muted}>Loading...</Text>
        </View>
      ) : requestError ? (
        <Text style={styles.error}>{requestError}</Text>
      ) : request ? (
        <View>
          <View style={styles.card}>
            <Text style={styles.title}>{request.title}</Text>
            <Text style={styles.meta}>{request.location}</Text>
            <Text style={styles.meta}>Budget: {request.budget.toLocaleString()}</Text>
            <Text style={styles.meta}>
              {request.createdAt ? formatTimestamp(request.createdAt as never) : "Just now"}
            </Text>
            {request.description ? (
              <Text style={styles.detail}>{request.description}</Text>
            ) : null}
          </View>

          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Submit Quote</Text>
            {quote ? (
              <Text style={styles.notice}>You already submitted a quote. You can update it.</Text>
            ) : null}
            {submittedNotice ? <Text style={styles.ok}>{submittedNotice}</Text> : null}
            {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

            <Text style={styles.label}>Price</Text>
            <TextInput
              value={priceInput}
              onChangeText={setPriceInput}
              placeholder="e.g. 120000"
              keyboardType="number-pad"
              style={styles.input}
              editable={!submitting}
            />

            <Text style={styles.label}>Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Message to customer"
              style={[styles.input, styles.textArea]}
              multiline
              editable={!submitting}
            />

            <TouchableOpacity
              style={[styles.btn, submitting && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.btnText}>{submitting ? "Submitting..." : "Submit"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.muted}>Request not found.</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    width: 52,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backText: { color: "#111827", fontWeight: "700" },
  headerTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: "#111827" },
  loadingBox: { padding: 16, alignItems: "center", gap: 8 },
  muted: { color: "#6B7280" },
  error: { color: "#DC2626", marginTop: 8 },
  ok: { marginTop: 8, color: "#16A34A", fontWeight: "700" },
  notice: { marginTop: 8, color: "#111827" },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    margin: 16,
  },
  title: { fontSize: 16, fontWeight: "700" },
  meta: { marginTop: 6, color: "#6B7280" },
  detail: { marginTop: 10, color: "#111827", lineHeight: 20 },
  form: { paddingHorizontal: 16, paddingBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
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
  textArea: { height: 110, textAlignVertical: "top" },
  btn: {
    marginTop: 16,
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "800" },
});
