import { useEffect, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '@/src/firebase';
import { RoomDoc } from '@/src/types/models';
import { formatTimestamp } from '@/src/utils/time';

const CUSTOMER_ID = 'customer-demo';

export default function ChatsScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'rooms'),
      where('customerId', '==', CUSTOMER_ID),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setRooms(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<RoomDoc, 'id'>),
          }))
        );
      },
      (err) => setError(err.message)
    );
    return () => unsub();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>채팅</Text>
      {error ? <Text style={styles.error}>에러: {error}</Text> : null}
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>채팅이 없습니다.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/chats/${item.id}`)}>
            <Text style={styles.cardTitle}>요청: {item.requestId}</Text>
            <Text style={styles.cardMeta}>파트너: {item.partnerId}</Text>
            <Text style={styles.cardMeta}>{formatTimestamp(item.createdAt as never)}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  list: { gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardMeta: { marginTop: 6, color: '#6B7280' },
  error: { color: '#DC2626', marginBottom: 8 },
  empty: { color: '#6B7280', paddingVertical: 12 },
});
