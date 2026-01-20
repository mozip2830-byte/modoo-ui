// apps/customer/app/(customer)/chats/_layout.tsx
import { Stack } from "expo-router";

export default function ChatsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // ✅ 최상단 "chats/[id]" 기본 헤더 제거
      }}
    />
  );
}
