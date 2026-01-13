import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import React from 'react';


function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

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
