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
  const { uid } = useAuthUid(); // ✅ 여기 핵심: 문자열 uid만 꺼내서 사용
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCount(0);
      return;
    }

    const unsub = subscribeUnreadCount(uid, setCount, (err) => {
      console.error("[customer][notifications] unread error", err);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [uid]);

  return (
    <TouchableOpacity style={styles.button} onPress={() => router.push(href as any)}>
      <FontAwesome name="bell" size={20} color={colors.text} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? "99+" : String(count)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

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
