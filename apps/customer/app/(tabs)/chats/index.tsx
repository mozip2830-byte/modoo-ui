import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { getDownloadURL, listAll, ref } from "firebase/storage";

import { subscribeCustomerChats } from "@/src/actions/chatActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { ChatDoc } from "@/src/types/models";
import { formatTimestamp } from "@/src/utils/time";
import { db, storage } from "@/src/firebase";
import { LABELS } from "@/src/constants/labels";
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
  const [partnerMeta, setPartnerMeta] = useState<Record<string, { name: string; reviewCount: number; ratingAvg: number; photoUrl?: string | null }>>({});
  const [reviewMeta, setReviewMeta] = useState<Record<string, { ratingAvg: number; reviewCount: number }>>({});
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

  const resolveStorageUrl = async (value?: string | null) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    try {
      return await getDownloadURL(ref(storage, trimmed));
    } catch (err) {
      console.warn("[chats] storage url resolve failed", trimmed, err);
      return null;
    }
  };

  const getStorageThumbUrl = async (partnerId: string) => {
    try {
      const photosRef = ref(storage, `partners/${partnerId}/photos`);
      const thumbsRef = ref(storage, `partners/${partnerId}/photos/thumbs`);
      const photosResult = await listAll(photosRef);
      let thumbsResult: { items: typeof photosResult.items };
      try {
        thumbsResult = await listAll(thumbsRef);
      } catch {
        thumbsResult = { items: [] as typeof photosResult.items };
      }

      const profileThumb = thumbsResult.items.find((item) => item.name.startsWith("profile"));
      if (profileThumb) return await getDownloadURL(profileThumb);

      const firstThumb = thumbsResult.items[0];
      if (firstThumb) return await getDownloadURL(firstThumb);

      const profilePhoto = photosResult.items.find((item) => item.name.startsWith("profile"));
      if (profilePhoto) return await getDownloadURL(profilePhoto);

      const firstPhoto = photosResult.items[0];
      if (firstPhoto) return await getDownloadURL(firstPhoto);

      return null;
    } catch (err) {
      console.warn("[chats] storage list failed", partnerId, err);
      const fallbackThumb = await resolveStorageUrl(
        `partners/${partnerId}/photos/thumbs/profile.jpg`
      );
      if (fallbackThumb) return fallbackThumb;
      return await resolveStorageUrl(`partners/${partnerId}/photos/profile.jpg`);
    }
  };

  useEffect(() => {
    const missing = partnerIds.filter((id) => !partnerMeta[id]);
    if (!missing.length) return;

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        missing.map(async (partnerId) => {
          try {
            const snap = await getDoc(doc(db, "partners", partnerId));
            if (!snap.exists()) return [partnerId, { name: "", reviewCount: 0, ratingAvg: 0 }] as const;
            const data = snap.data() as {
              name?: string;
              companyName?: string;
              profileImages?: string[];
              photoUrl?: string | null;
              imageUrl?: string | null;
              logoUrl?: string | null;
              reviewCount?: number;
              ratingAvg?: number;
              trust?: { reviewCount?: number; reviewAvg?: number; factors?: { reviewCount?: number; reviewAvg?: number } };
            };
            const name = data?.name ?? data?.companyName ?? "";
            const reviewCount = Number(
              data?.reviewCount ?? data?.trust?.factors?.reviewCount ?? data?.trust?.reviewCount ?? 0
            );
            const ratingAvg = Number(
              data?.ratingAvg ?? data?.trust?.factors?.reviewAvg ?? data?.trust?.reviewAvg ?? 0
            );
            const photoCandidates = [
              ...(data.profileImages ?? []),
              data.photoUrl,
              data.imageUrl,
              data.logoUrl,
            ].filter(Boolean) as string[];
            let photoUrl = null;
            if (photoCandidates.length) {
              for (const candidate of photoCandidates) {
                const resolved = await resolveStorageUrl(candidate);
                if (resolved) {
                  photoUrl = resolved;
                  break;
                }
              }
            }
            if (!photoUrl) {
              photoUrl = await getStorageThumbUrl(partnerId);
            }
            if (!photoUrl) {
              console.warn("[chats] photo missing", partnerId);
            }
            return [partnerId, { name, reviewCount, ratingAvg, photoUrl }] as const;
          } catch {
            return [partnerId, { name: "", reviewCount: 0, ratingAvg: 0 }] as const;
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
    if (!partnerIds.length) return;
    let cancelled = false;

    (async () => {
      const targets = partnerIds.filter((id) => {
        const meta = partnerMeta[id];
        return !meta || (meta.reviewCount === 0 && meta.ratingAvg === 0);
      });
      if (!targets.length) return;

      const entries = await Promise.all(
        targets.map(async (partnerId) => {
          try {
            const snap = await getDocs(
              query(collection(db, "reviews"), where("partnerId", "==", partnerId))
            );
            const docs = snap.docs.map((docSnap) => docSnap.data() as { rating?: number });
            const reviewCount = docs.length;
            if (!reviewCount) return [partnerId, null] as const;
            const sum = docs.reduce((acc, item) => acc + Number(item.rating ?? 0), 0);
            const ratingAvg = sum / reviewCount;
            return [partnerId, { ratingAvg, reviewCount }] as const;
          } catch (err) {
            console.warn("[chats] review meta error", err);
            return [partnerId, null] as const;
          }
        })
      );

      if (cancelled) return;
      setReviewMeta((prev) => {
        const next = { ...prev };
        entries.forEach(([partnerId, meta]) => {
          if (meta) next[partnerId] = meta;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [partnerIds, partnerMeta]);

  useEffect(() => {
    if (!partnerIds.length) return;
    let cancelled = false;

    const refreshPhotos = async () => {
      const targets = partnerIds.filter((id) => !partnerMeta[id]?.photoUrl);
      if (!targets.length) return;
      const entries = await Promise.all(
        targets.map(async (partnerId) => {
          const photoUrl = await getStorageThumbUrl(partnerId);
          return [partnerId, photoUrl] as const;
        })
      );
      if (cancelled) return;
      setPartnerMeta((prev) => {
        const next = { ...prev };
        entries.forEach(([partnerId, photoUrl]) => {
          if (!photoUrl) return;
          next[partnerId] = { ...(next[partnerId] ?? { name: "", reviewCount: 0, ratingAvg: 0 }), photoUrl };
        });
        return next;
      });
    };

    refreshPhotos();
    const intervalId = setInterval(refreshPhotos, 15000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
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
      setError(LABELS.messages.loginRequired);
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
        setError(LABELS.messages.errorLoadChats);
      }
    );
    return () => {
      if (unsub) unsub();
    };
  }, [ready, uid]);

  return (
    <Screen scroll={false} style={styles.container}>
      <View style={styles.headerTop}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{LABELS.headers.chats}</Text>
          <Text style={styles.headerSubtitle}>최근 채팅 목록을 확인하세요.</Text>
        </View>
        <View style={styles.headerActions}>
          <NotificationBell href="/notifications" />
          <TouchableOpacity onPress={() => router.push("/login")} style={styles.iconBtn}>
            <FontAwesome name="user" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState title={LABELS.messages.noChats} description="요청 상세에서 채팅을 시작하세요." />
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
              <Card style={styles.cardSurface}>
                <CardRow>
                  <View style={styles.avatar}>
                    {partnerMeta[item.partnerId ?? ""]?.photoUrl ? (
                      <Image
                        source={{ uri: partnerMeta[item.partnerId ?? ""]?.photoUrl as string }}
                        style={styles.avatarImage}
                      />
                    ) : null}
                  </View>
                  <View style={styles.info}>
                    {serviceText ? (
                      <Text style={styles.serviceText} numberOfLines={1}>
                        {serviceText}
                      </Text>
                    ) : null}
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {partnerMeta[item.partnerId ?? ""]?.name ?? "파트너명 미등록"}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      평점{" "}
                      {(reviewMeta[item.partnerId ?? ""]?.ratingAvg ??
                        partnerMeta[item.partnerId ?? ""]?.ratingAvg ??
                        0
                      ).toFixed(1)}{" "}
                      · 리뷰{" "}
                      {reviewMeta[item.partnerId ?? ""]?.reviewCount ??
                        partnerMeta[item.partnerId ?? ""]?.reviewCount ??
                        0}{" "}
                      / {item.lastMessageText ?? LABELS.messages.noMessages}
                    </Text>
                  </View>
                  <View style={styles.metaRight}>
                    <Text style={styles.time}>
                      {item.updatedAt
                        ? formatTimestamp(item.updatedAt as never)
                        : LABELS.messages.justNow}
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
  container: { flex: 1, backgroundColor: "#F7F2ED" },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: { marginBottom: spacing.md },
  cardSurface: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  serviceText: { fontSize: 12, fontWeight: "700", color: colors.text },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  cardMeta: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  error: { color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D9F5F0",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  info: { flex: 1, marginLeft: spacing.md },
  metaRight: { alignItems: "flex-end", gap: spacing.xs },
  time: { color: colors.subtext, fontSize: 11 },
  headerTop: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  headerSubtitle: { marginTop: 4, color: colors.subtext, fontSize: 12 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8E0D6",
  },
});



