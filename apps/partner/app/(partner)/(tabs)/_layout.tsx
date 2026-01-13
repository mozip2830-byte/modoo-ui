import { Tabs } from "expo-router";
import React from "react";

export default function PartnerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="requests"
        options={{ title: "요청" }}
      />
      <Tabs.Screen
        name="chats"
        options={{ title: "채팅" }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "프로필" }}
      />
    </Tabs>
  );
}
