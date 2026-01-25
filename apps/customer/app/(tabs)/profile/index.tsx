import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";

import { signOutCustomer } from "@/src/actions/authActions";
import { LABELS } from "@/src/constants/labels";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/ui/components/Buttons";
import { Card } from "@/src/ui/components/Card";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { db, storage } from "@/src/firebase";

export default function ProfileScreen() {
  const router = useRouter();
  const { uid, status } = useAuthUid();
  const [profile, setProfile] = useState<{
    name?: string;
    nickname?: string;
    email?: string;
    photoUrl?: string;
    photoPath?: string;
  } | null>(null);
  const photoSyncRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === "noUid") {
      router.replace({ pathname: "/login", params: { force: "1" } });
      return;
    }
    if (!uid) {
      setProfile(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "customerUsers", uid),
      (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          return;
        }
        const data = snap.data() as {
          name?: string;
          nickname?: string;
          email?: string;
          photoUrl?: string;
          photoPath?: string;
        };
        setProfile({
          name: data.name,
          nickname: data.nickname,
          email: data.email,
          photoUrl: data.photoUrl,
          photoPath: data.photoPath,
        });
      },
      (err) => {
        console.warn("[customer][profile] load error", err);
        setProfile(null);
      }
    );

    return () => unsub();
  }, [status, uid, router]);

  useEffect(() => {
    if (!profile?.photoPath || profile.photoUrl) return;
    if (photoSyncRef.current === profile.photoPath) return;
    photoSyncRef.current = profile.photoPath;

    let active = true;

    (async () => {
      try {
        const url = await getDownloadURL(ref(storage, profile.photoPath as string));
        if (!active) return;
        setProfile((prev) => (prev ? { ...prev, photoUrl: url } : prev));
        await updateDoc(doc(db, "customerUsers", uid as string), { photoUrl: url });
      } catch (err) {
        console.warn("[customer][profile] photo url sync error", err);
      }
    })();

    return () => {
      active = false;
    };
  }, [profile?.photoPath, profile?.photoUrl, uid]);

  const displayName = useMemo(() => {
    if (!profile) return "고객";
    return profile.nickname?.trim() || profile.name?.trim() || profile.email?.trim() || "고객";
  }, [profile]);

  const handleLogout = useCallback(() => {
    Alert.alert("로그아웃", "정말 로그아웃할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          try {
            await signOutCustomer();
            router.replace({ pathname: "/login", params: { force: "1" } });
          } catch (err) {
            const message = err instanceof Error ? err.message : "로그아웃에 실패했습니다.";
            Alert.alert("로그아웃 실패", message);
          }
        },
      },
    ]);
  }, [router]);

  return (
    <Screen scroll style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerTop}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{LABELS.headers.profile}</Text>
          <Text style={styles.headerSubtitle}>계정 정보를 관리하세요.</Text>
        </View>
        <View style={styles.headerActions}>
          <NotificationBell href="/notifications" />
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/login", params: { force: "1" } })}
            style={styles.iconBtn}
          >
            <FontAwesome name="user" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      <Card style={[styles.cardSurface, styles.profileCard]}>
        {profile?.photoUrl ? (
          <Image source={{ uri: profile.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar} />
        )}
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.desc}>요청과 채팅을 한곳에서 관리하세요.</Text>
        </View>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push("/(customer)/profile-edit")}
        >
          <Text style={styles.editButtonText}>프로필 편집</Text>
        </TouchableOpacity>
      </Card>
      <Card style={[styles.cardSurface, styles.menuCard]}>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push("/(customer)/request-management")}
        >
          <Text style={styles.menuItem}>요청 관리</Text>
          <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push("/(customer)/notification-settings")}
        >
          <Text style={styles.menuItem}>알림 설정</Text>
          <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => router.push("/(customer)/support")}
        >
          <Text style={styles.menuItem}>고객지원</Text>
          <FontAwesome name="chevron-right" size={14} color={colors.subtext} />
        </TouchableOpacity>
      </Card>
      <Card style={[styles.cardSurface, styles.logoutCard]}>
        <SecondaryButton label="로그아웃" onPress={handleLogout} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F2ED" },
  content: { paddingBottom: spacing.xxl },
  headerTop: {
    marginTop: spacing.xl,
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
  cardSurface: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  profileCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#D9F5F0",
  },
  profileInfo: { flex: 1 },
  name: { fontSize: 18, fontWeight: "700", color: colors.text },
  desc: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  editButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E8E0D6",
    backgroundColor: "#F7F4F0",
  },
  editButtonText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  menuCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  menuRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  menuItem: { fontSize: 14, color: colors.text, fontWeight: "600" },
  logoutCard: { marginHorizontal: spacing.lg, marginTop: spacing.md },
});


