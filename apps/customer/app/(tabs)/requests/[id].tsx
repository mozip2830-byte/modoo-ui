import { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { acceptQuote, createRequest } from '@/src/actions/customerActions';
import { getOrCreateRoom } from '@/src/lib/chat';
import { useAuthUid } from '@/src/lib/useAuthUid';

const CUSTOMER_ID = 'customer-demo';

export default function NewRequestScreen() {
  const router = useRouter();
  const { id, quoteId, partnerId } = useLocalSearchParams<{
    id?: string;
    quoteId?: string;
    partnerId?: string;
  }>();
  const uid = useAuthUid();
  const [title, setTitle] = useState('욕실 수리');
  const [description, setDescription] = useState('타일 보수와 방수 작업이 필요합니다.');
  const [location, setLocation] = useState('서울 강남구');
  const [budget, setBudget] = useState('150000');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  const handleSubmit = async () => {
    setStatus('saving');
    try {
      const paramRequestId = Array.isArray(id) ? id[0] : id;
      const paramQuoteId = Array.isArray(quoteId) ? quoteId[0] : quoteId;
      const paramPartnerId = Array.isArray(partnerId) ? partnerId[0] : partnerId;

      if (paramRequestId && paramQuoteId && paramPartnerId) {
        if (!uid) {
          throw new Error('Login required.');
        }

        await acceptQuote({
          quoteId: paramQuoteId,
          requestId: paramRequestId,
          partnerId: paramPartnerId,
          customerId: uid,
        });

        const roomId = await getOrCreateRoom({
          requestId: paramRequestId,
          partnerId: paramPartnerId,
          customerId: uid,
          quoteId: paramQuoteId,
        });

        setStatus('idle');
        router.push(`/(tabs)/chats/${roomId}`);
        return;
      }

      const requestId = await createRequest({
        title,
        description,
        location,
        budget: Number(budget) || 0,
        customerId: CUSTOMER_ID,
      });
      setStatus('idle');
      router.replace(`/requests/${requestId}`);
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>요청 등록</Text>
      {status === 'error' ? (
        <Text style={styles.error}>요청 등록에 실패했습니다.</Text>
      ) : null}
      <View style={styles.form}>
        <Text style={styles.label}>제목</Text>
        <TextInput value={title} onChangeText={setTitle} style={styles.input} />
        <Text style={styles.label}>설명</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.textArea]}
          multiline
        />
        <Text style={styles.label}>지역</Text>
        <TextInput value={location} onChangeText={setLocation} style={styles.input} />
        <Text style={styles.label}>예산</Text>
        <TextInput value={budget} onChangeText={setBudget} style={styles.input} keyboardType="numeric" />
        <TouchableOpacity style={styles.button} onPress={handleSubmit}>
          <Text style={styles.buttonText}>
            {status === 'saving' ? '등록 중...' : '등록하기'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  form: { gap: 12 },
  label: { fontWeight: '600' },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  button: {
    marginTop: 8,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
  error: { color: '#DC2626', marginBottom: 8 },
});
