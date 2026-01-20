import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { doc, getDoc } from "firebase/firestore";

import { subscribeCustomerChats } from "@/src/actions/chatActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { ChatDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { db } from "@/src/firebase";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { Chip } from "@/src/ui/components/Chip";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { Screen } from "@/src/components/Screen";
import { colors, spacing } from "@/src/ui/tokens";

export default function ChatsScreen() {
  const router = useRouter();
  const auth = useAuthUid();
  const uid = auth.uid;
  const ready = auth.status === "ready";
  const [chats, setChats] = useState<ChatDoc[]>([]);
  const [partnerMeta, setPartnerMeta] = useState<Record<string, { name: string; reviewCount: number }>>({});
  const [requestMeta, setRequestMeta] = useState<Record<string, { serviceType?: string; serviceSubType?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const hadErrorRef = useRef(false);

  const partnerIds = useMemo(() => {
    const ids = chats
      .map((chat) => chat.partnerId)
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(ids));
  }, [chats]);

  const requestIds = useMemo(() => {
    const ids = chats
      .map((chat) => chat.requestId)
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(ids));
  }, [chats]);

  useEffect(() => {
    const missing = partnerIds.filter((id) => !partnerMeta[id]);
    if (!missing.length) return;

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        missing.map(async (partnerId) => {
          try {
            const snap = await getDoc(doc(db, "partners", partnerId));
            if (!snap.exists()) return [partnerId, ""] as const;
            const data = snap.data() as {
              name?: string;
              companyName?: string;
              reviewCount?: number;
              trust?: { reviewCount?: number };
            };
            const name = data?.name ?? data?.companyName ?? "";
            const reviewCount = Number(data?.reviewCount ?? data?.trust?.reviewCount ?? 0);
            return [partnerId, { name, reviewCount }] as const;
          } catch {
            return [partnerId, { name: "", reviewCount: 0 }] as const;
          }
        })
      );

      if (cancelled) return;
      setPartnerMeta((prev) => {
        const next = { ...prev };
        entries.forEach(([partnerId, meta]) => {
          if (!next[partnerId] && meta.name) next[partnerId] = meta;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [partnerIds, partnerMeta]);

  useEffect(() => {
    const missing = requestIds.filter((id) => !requestMeta[id]);
    if (!missing.length) return;

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        missing.map(async (requestId) => {
          try {
            const snap = await getDoc(doc(db, "requests", requestId));
            if (!snap.exists()) return [requestId, {}] as const;
            const data = snap.data() as {
              serviceType?: string;
              serviceSubType?: string;
            };
            return [requestId, {
              serviceType: data?.serviceType,
              serviceSubType: data?.serviceSubType,
            }] as const;
          } catch {
            return [requestId, {}] as const;
          }
        })
      );

      if (cancelled) return;
      setRequestMeta((prev) => {
        const next = { ...prev };
        entries.forEach(([requestId, meta]) => {
          if (!next[requestId] && (meta.serviceType || meta.serviceSubType)) next[requestId] = meta;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [requestIds, requestMeta]);

  useEffect(() => {
    if (!ready) {
      setError(null);
      return;
    }

    if (!uid) {
      setChats([]);
      setError("로그인이 필요합니다.");
      console.info("[chats] subscribe skipped: missing uid");
      return;
    }

    hadErrorRef.current = false;
    console.log("[chats] uid=", uid, "subscribe start");

    const unsub = subscribeCustomerChats(
      uid,
      (items) => {
        setChats(items);
        setError(null);
        console.log("[chats] onData count=", items.length);
        if (items.length === 0 && !hadErrorRef.current) {
          console.info("[chats] empty result: no error; data missing or filter mismatch");
        }
      },
      (err) => {
        hadErrorRef.current = true;
        console.error("[chats] onError", err);
        setError("채팅을 불러오지 못했습니다.");
      }
    );
    return () => {
      if (unsub) unsub();
    };
  }, [ready, uid]);

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title="채팅"
        subtitle="최근 대화 목록을 확인하세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/notifications" />
            <TouchableOpacity onPress={() => router.push("/login")} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />
      {error ? <Text style={styles.error}>{"오류: "}{error}</Text> : null}
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState title="채팅이 없습니다" description="요청 상세에서 채팅을 시작하세요." />
        }
        renderItem={({ item }) => {
          const serviceText = (() => {
            const rawType = (item as any).serviceType ?? requestMeta[item.requestId ?? ""]?.serviceType;
            const rawSub = (item as any).serviceSubType ?? requestMeta[item.requestId ?? ""]?.serviceSubType;
            if (!rawType) return "";
            return `${rawType}${rawSub ? ` / ${rawSub}` : ""}`;
          })();

          return (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/chats/${item.id}`)}>
              <Card>
                <CardRow>
                  <View style={styles.avatar} />
                  <View style={styles.info}>
                    {serviceText ? (
                      <Text style={styles.serviceText} numberOfLines={1}>
                        {serviceText}
                      </Text>
                    ) : null}
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {partnerMeta[item.partnerId ?? ""]?.name ?? item.partnerId ?? "-"}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {"리뷰 "}{partnerMeta[item.partnerId ?? ""]?.reviewCount ?? 0}{" / "}
                      {item.lastMessageText ?? "메시지 없음"}
                    </Text>
                  </View>
                  <View style={styles.metaRight}>
                    <Text style={styles.time}>
                      {item.updatedAt
                        ? formatTimestamp(item.updatedAt as never)
                        : "방금"}
                    </Text>
                    {item.unreadCustomer > 0 ? (
                      <Chip label={`${item.unreadCustomer}`} tone="warning" />
                    ) : null}
                  </View>
                </CardRow>
              </Card>
            </TouchableOpacity>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { marginBottom: spacing.md },
  serviceText: { fontSize: 12, fontWeight: "700", color: colors.text },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  cardMeta: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D9F5F0",
  },
  info: { flex: 1, marginLeft: spacing.md },
  metaRight: { alignItems: "flex-end", gap: spacing.xs },
  time: { color: colors.subtext, fontSize: 11 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
});
