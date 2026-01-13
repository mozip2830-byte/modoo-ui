import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import React from 'react';


function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: "홈" }} />
      <Tabs.Screen name="requests" options={{ title: "요청" }} />
      <Tabs.Screen name="chats" options={{ title: "채팅" }} />
      <Tabs.Screen name="profile" options={{ title: "내정보" }} />
    </Tabs>
  );
}
