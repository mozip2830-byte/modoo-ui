import { Tabs } from "expo-router";
import React from "react";

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="home/index" options={{ title: "홈" }} />
      <Tabs.Screen name="requests/index" options={{ title: "요청" }} />
      <Tabs.Screen name="chats/index" options={{ title: "채팅" }} />
      <Tabs.Screen name="profile/index" options={{ title: "프로필" }} />
    </Tabs>
  );
}
