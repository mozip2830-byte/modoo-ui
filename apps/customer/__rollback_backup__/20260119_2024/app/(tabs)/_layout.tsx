import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LABELS } from "@/src/constants/labels";
import { colors } from "@/src/ui/tokens";

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -2 }} {...props} />;
}

function getTabOptions(label: string, iconName: React.ComponentProps<typeof FontAwesome>["name"]) {
  return {
    title: label,
    tabBarIcon: ({ color }: { color: string }) => <TabBarIcon name={iconName} color={color} />,
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtext,
        tabBarLabelStyle: { fontSize: 11, marginBottom: 2 },
        tabBarStyle: {
          height: 56 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
          backgroundColor: colors.card,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="home/index"
        options={getTabOptions(LABELS.tabs.home, "home")}
      />
      <Tabs.Screen
        name="search/index"
        options={getTabOptions(LABELS.tabs.search, "search")}
      />
      <Tabs.Screen
        name="quotes/index"
        options={getTabOptions(LABELS.tabs.quotes, "file-text-o")}
      />
      <Tabs.Screen
        name="chats/index"
        options={getTabOptions(LABELS.tabs.chats, "comments")}
      />
      <Tabs.Screen
        name="profile/index"
        options={getTabOptions(LABELS.tabs.profile, "user")}
      />
    </Tabs>
  );
}
