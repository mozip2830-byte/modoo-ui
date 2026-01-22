import { addDoc, collection, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { deleteQuoteTemplate, subscribeQuoteTemplates } from "@/src/actions/quoteTemplateActions";
import { pickImages, uploadImage } from "@/src/actions/storageActions";
import { Screen } from "@/src/components/Screen";
import { db } from "@/src/firebase";
import { autoRecompress } from "@/src/lib/imageCompress";
import { useAuthUid } from "@/src/lib/useAuthUid";
import type { QuoteTemplateDoc } from "@/src/types/models";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { Card } from "@/src/ui/components/Card";
import { colors, spacing } from "@/src/ui/tokens";

const MAX_PHOTOS = 10;
const MAX_TEXT = 500;

export default function QuoteTemplateScreen() {
  const { uid: partnerId } = useAuthUid();
  const [templates, setTemplates] = useState<QuoteTemplateDoc[]>([]);
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [photos, setPhotos] = useState<{ uri: string; remote?: boolean }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!partnerId) {
      setTemplates([]);
      return;
    }
    const unsub = subscribeQuoteTemplates(partnerId, (items) => setTemplates(items));
    return () => {
      if (unsub) unsub();
    };
  }, [partnerId]);

  const remaining = useMemo(() => Math.max(0, MAX_PHOTOS - photos.length), [photos.length]);

  const handlePickPhotos = async () => {
    if (remaining <= 0) return;
    try {
      const assets = await pickImages({ maxCount: remaining });
      if (!assets.length) return;
      setPhotos((prev) => [...prev, ...assets.map((asset) => ({ uri: asset.uri, remote: false }))]);
    } catch (err) {
      console.error("[partner][template] pick error", err);
      Alert.alert("사진 선택 실패", "사진을 선택하지 못했습니다.");
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    if (!partnerId) return;

    if (templates.length >= 10) {
      Alert.alert("저장 제한", "견적 템플릿은 최대 10개까지 저장할 수 있습니다.");
      return;
    }

    const trimmedMemo = memo.trim();

    if (trimmedMemo.length > MAX_TEXT) {
      Alert.alert("입력 제한", "메모는 최대 500자까지 입력할 수 있습니다.");
      return;
    }

    if (!trimmedMemo && photos.length === 0) {
      Alert.alert("저장 불가", "메모 또는 사진 중 하나는 입력해야 합니다.");
      return;
    }

    setSaving(true);
    try {
      const nextTitle = title.trim() || `견적 템플릿 ${templates.length + 1}`;

      const templateRef = await addDoc(collection(db, "partnerQuoteTemplates"), {
        partnerId,
        title: nextTitle,
        memo: trimmedMemo,
        photoUrls: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const timestamp = Date.now();
      const uploadedUrls: string[] = [];

      for (const [index, photo] of photos.entries()) {
        if (photo.remote) {
          uploadedUrls.push(photo.uri);
          continue;
        }

        const prepared = await autoRecompress(
          { uri: photo.uri, maxSize: 1600, quality: 0.75 },
          2 * 1024 * 1024
        );

        const uploaded = await uploadImage({
          uri: prepared.uri,
          storagePath: `quoteTemplates/${partnerId}/${templateRef.id}/${timestamp}-${index}.jpg`,
          contentType: "image/jpeg",
        });

        uploadedUrls.push(uploaded.url);
      }

      await updateDoc(templateRef, {
        photoUrls: uploadedUrls,
        updatedAt: serverTimestamp(),
      });

      setTitle("");
      setMemo("");
      setPhotos([]);
      Alert.alert("저장 완료", "견적 템플릿이 저장되었습니다.");
    } catch (err) {
      console.error("[partner][template] save error", err);
      Alert.alert("저장 실패", "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!templateId) return;
    await deleteQuoteTemplate(templateId);
  };

  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="견적 템플릿" subtitle="자주 쓰는 견적 내용을 저장해요." />

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>템플릿 추가</Text>

        <Text style={styles.label}>제목</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="예: 기본 입주청소"
          style={styles.input}
        />

        <Text style={styles.label}>메모 내용</Text>
        <TextInput
          value={memo}
          onChangeText={setMemo}
          placeholder="고객에게 전달할 메모 내용을 입력해 주세요."
          maxLength={MAX_TEXT}
          style={[styles.input, styles.textArea]}
          multiline
        />

        <View style={styles.photoRow}>
          <Text style={styles.label}>
            사진 ({photos.length}/{MAX_PHOTOS})
          </Text>
          <SecondaryButton
            label="사진 첨부"
            onPress={handlePickPhotos}
            disabled={remaining <= 0 || saving}
          />
        </View>

        {photos.length ? (
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoItem}>
                <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                <TouchableOpacity style={styles.photoRemove} onPress={() => handleRemovePhoto(index)}>
                  <Text style={styles.photoRemoveText}>삭제</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <PrimaryButton label={saving ? "저장 중..." : "템플릿 저장"} onPress={handleSave} disabled={saving} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>저장된 템플릿</Text>

        {templates.length === 0 ? (
          <Text style={styles.muted}>저장된 템플릿이 없습니다.</Text>
        ) : (
          <View style={styles.list}>
            {templates.map((item) => (
              <View key={item.id} style={styles.listItem}>
                <View style={styles.listText}>
                  <Text style={styles.listTitle}>{item.title}</Text>
                  <Text style={styles.listMeta} numberOfLines={1}>
                    {item.memo}
                  </Text>
                  <Text style={styles.listMeta}>사진 {item.photoUrls?.length ?? 0}장</Text>
                </View>
                <SecondaryButton label="삭제" onPress={() => handleDelete(item.id)} />
              </View>
            ))}
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: { gap: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  label: { fontWeight: "600", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  textArea: { height: 120, textAlignVertical: "top" },
  photoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoItem: { width: 92, gap: spacing.xs },
  photoImage: { width: 92, height: 92, borderRadius: 12, backgroundColor: colors.card },
  photoRemove: {
    alignItems: "center",
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoRemoveText: { fontSize: 12, color: colors.text, fontWeight: "600" },
  list: { gap: spacing.sm },
  listItem: {
    padding: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.card,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  listText: { flex: 1, gap: 4 },
  listTitle: { fontWeight: "700", color: colors.text },
  listMeta: { color: colors.subtext, fontSize: 12 },
  muted: { color: colors.subtext, fontSize: 12 },
});
