import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { LABELS } from "@/src/constants/labels";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card, CardRow } from "@/src/ui/components/Card";
import { EmptyState } from "@/src/ui/components/EmptyState";
import { NotificationBell } from "@/src/ui/components/NotificationBell";
import { colors, spacing } from "@/src/ui/tokens";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { Screen } from "@/src/components/Screen";

type Room = {
  id: string;
  title: string;
  lastMessage: string;
};

export default function PartnerChatsScreen() {
  const router = useRouter();
  const uid = useAuthUid();
  const target = uid ? "/(partner)/(tabs)/profile" : "/(partner)/auth/login";

  const [rooms] = useState<Room[]>([
    { id: "room_1", title: "고객 A - 주방", lastMessage: "견적 확인 부탁드립니다." },
    { id: "room_2", title: "고객 B - 화장실", lastMessage: "방문 가능한 일정 알려주세요." },
  ]);

  return (
    <Screen scroll={false} style={styles.container}>
      <AppHeader
        title={LABELS.headers.chats}
        subtitle="최근 대화 목록을 확인하세요."
        rightAction={
          <View style={styles.headerActions}>
            <NotificationBell href="/(partner)/notifications" />
            <TouchableOpacity onPress={() => router.push(target)} style={styles.iconBtn}>
              <FontAwesome name="user" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.cardWrap}
            onPress={() => router.push(`/(partner)/chats/${item.id}`)}
          >
            <Card>
              <CardRow>
                <View style={styles.avatar} />
                <View style={styles.info}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                </View>
              </CardRow>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState title="채팅이 없습니다." description="요청에서 채팅을 시작해 보세요." />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  cardWrap: { marginBottom: spacing.md },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  cardMeta: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D9F5F0",
  },
  info: { flex: 1, marginLeft: spacing.md },
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
