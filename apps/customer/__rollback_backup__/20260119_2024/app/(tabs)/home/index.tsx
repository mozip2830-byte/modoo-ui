import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { subscribeUnreadCount } from "@/src/actions/notificationActions";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { colors, spacing } from "@/src/ui/tokens";

type NotificationBellProps = {
  href: string;
};

export function NotificationBell({ href }: NotificationBellProps) {
  const router = useRouter();

  // ✅ 여기 핵심: useAuthUid()는 보통 { uid } 형태
  const { uid } = useAuthUid();

  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCount(0);
      return;
    }

    const unsub = subscribeUnreadCount(
      uid,
      (c) => setCount(c),
      (err) => console.error("[customer][notifications] unread error", err)
    );

    return () => unsub?.();
  }, [uid]);

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => router.push(href as any)}
      activeOpacity={0.85}
    >
      <FontAwesome name="bell" size={20} color={colors.text} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? "99+" : String(count)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ✅ 혹시 다른 화면에서 default import로 쓰고 있으면 그것도 안 터지게 “보험”
export default NotificationBell;

const styles = StyleSheet.create({
  button: {
    position: "relative",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badge: {
    position: "absolute",
    right: 2,
    top: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
});
