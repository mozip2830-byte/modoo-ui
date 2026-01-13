import { useEffect, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '@/src/firebase';
import { RequestDoc } from '@/src/types/models';
import { formatTimestamp } from '@/src/utils/time';

export default function HomeScreen() {
  const router = useRouter();
  const [items, setItems] = useState<RequestDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'requests'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<RequestDoc, 'id'>),
        }));
        setItems(data);
        setError(null);
      },
      (err) => {
        setError(err.message);
      }
    );

    return () => unsub();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>요청 목록</Text>
        <TouchableOpacity onPress={() => router.push('/requests/new')}>
          <Text style={styles.action}>새 요청</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>에러: {error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/requests/${item.id}`)}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardMeta}>{item.location}</Text>
            <Text style={styles.cardMeta}>예산: {item.budget.toLocaleString()}</Text>
            <Text style={styles.cardMeta}>상태: {item.status}</Text>
            <Text style={styles.cardMeta}>{formatTimestamp(item.createdAt as never)}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '700' },
  action: { color: '#2563EB', fontWeight: '600' },
  list: { padding: 16, gap: 12 },
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
  error: { color: '#DC2626', paddingHorizontal: 16, paddingBottom: 8 },
});
