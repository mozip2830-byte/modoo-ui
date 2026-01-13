import { Stack } from "expo-router";

export default function PartnerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="requests/[id]" />
      <Stack.Screen name="chats/[id]" />
    </Stack>
  );
}
