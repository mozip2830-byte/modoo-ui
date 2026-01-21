import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { colors, spacing } from "@/src/ui/tokens";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { db } from "@/src/firebase";
import { pickImages, uploadImage, deleteStorageFile } from "@/src/actions/storageActions";

type ProfileData = {
  name?: string;
  phone?: string;
  phoneVerified?: boolean;
  nickname?: string;
  photoUrl?: string;
  photoPath?: string;
};

export default function ProfileEditScreen() {
  const { uid } = useAuthUid();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  const [phoneEditing, setPhoneEditing] = useState(false);
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const profileSnap = await getDoc(doc(db, "customerUsers", uid));
        if (!active) return;
        if (profileSnap.exists()) {
          const data = profileSnap.data() as ProfileData;
          setProfile(data);
          setNickname(data.nickname ?? "");
          setPhone(data.phone ?? "");
          setPhotoUrl(data.photoUrl ?? null);
          setPhotoPath(data.photoPath ?? null);
          setPhoneVerified(Boolean(data.phoneVerified));
          setVerifiedPhone(data.phone ?? null);
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.warn("[customer][profile-edit] load error", err);
        if (active) setError("프로필 정보를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    };
    run();

    return () => {
      active = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!verifiedPhone) return;
    if (phone !== verifiedPhone) {
      setPhoneVerified(false);
    }
  }, [phone, verifiedPhone]);

  const displayName = useMemo(() => profile?.name ?? "-", [profile]);
  const currentPhone = profile?.phone ?? "";

  const canSave = useMemo(() => {
    if (!uid || loading || saving) return false;
    const nicknameChanged = nickname.trim() !== (profile?.nickname ?? "");
    const photoChanged = photoUrl !== (profile?.photoUrl ?? null);
    const phoneChanged = phoneEditing && phone.trim() !== currentPhone;
    const phoneReady = !phoneChanged || (phoneVerified && phone.trim() === verifiedPhone);
    return (nicknameChanged || photoChanged || phoneChanged) && phoneReady;
  }, [
    uid,
    loading,
    saving,
    nickname,
    profile,
    photoUrl,
    phoneEditing,
    phone,
    currentPhone,
    phoneVerified,
    verifiedPhone,
  ]);

  const handlePickPhoto = async () => {
    if (!uid) return;
    setError(null);
    try {
      const assets = await pickImages({ maxCount: 1 });
      if (!assets.length) return;
      const asset = assets[0];
      const nextPath = `customerProfiles/${uid}/avatar-${Date.now()}.jpg`;
      const uploaded = await uploadImage({
        uri: asset.uri,
        storagePath: nextPath,
        contentType: "image/jpeg",
      });
      if (photoPath && photoPath !== nextPath) {
        await deleteStorageFile(photoPath);
      }
      setPhotoUrl(uploaded.url);
      setPhotoPath(nextPath);
    } catch (err) {
      console.error("[customer][profile-edit] photo error", err);
      setError("프로필 사진 업로드에 실패했습니다.");
    }
  };

  const handleSendCode = () => {
    if (!phone.trim()) {
      setError("전화번호를 입력해 주세요.");
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setSentCode(code);
    setPhoneVerified(false);
    setVerifiedPhone(null);
    setCodeInput("");
    Alert.alert("인증번호 발송", `임시 인증번호: ${code}`);
  };

  const handleVerifyCode = () => {
    if (!sentCode) {
      setError("먼저 인증번호를 발송해 주세요.");
      return;
    }
    if (codeInput.trim() !== sentCode) {
      setError("인증번호가 올바르지 않습니다.");
      return;
    }
    setPhoneVerified(true);
    setVerifiedPhone(phone);
    setError(null);
  };

  const handleSave = async () => {
    if (!uid || !canSave) return;
    setSaving(true);
    setError(null);

    try {
      const updates: ProfileData & { updatedAt: unknown } = {
        nickname: nickname.trim(),
        updatedAt: serverTimestamp(),
      };

      if (photoUrl) {
        updates.photoUrl = photoUrl;
        updates.photoPath = photoPath ?? null;
      }

      if (phoneEditing && phone.trim() !== currentPhone) {
        updates.phone = phone.trim();
        updates.phoneVerified = true;
      }

      await setDoc(doc(db, "customerUsers", uid), updates, { merge: true });
      setProfile((prev) => ({ ...(prev ?? {}), ...updates }));
      if (phoneEditing && phone.trim() !== currentPhone) {
        setVerifiedPhone(phone.trim());
        setPhoneVerified(true);
      }
      setPhoneEditing(false);
      Alert.alert("저장 완료", "프로필이 저장되었습니다.");
    } catch (err) {
      console.error("[customer][profile-edit] save error", err);
      setError("프로필 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <AppHeader title="프로필 편집" subtitle="프로필 사진과 닉네임을 수정하세요." />

      <View style={styles.card}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <Text style={styles.desc}>불러오는 중...</Text> : null}

        <Text style={styles.label}>실명</Text>
        <View style={styles.readonlyBox}>
          <Text style={styles.readonlyText}>{displayName}</Text>
        </View>

        <Text style={styles.label}>닉네임</Text>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="닉네임"
          style={styles.input}
        />

        <Text style={styles.label}>프로필 사진</Text>
        <View style={styles.photoRow}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder} />
          )}
          <TouchableOpacity style={styles.photoButton} onPress={handlePickPhoto}>
            <Text style={styles.photoButtonText}>사진 변경</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>전화번호</Text>
        <View style={styles.row}>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
            style={[styles.input, styles.flex, !phoneEditing && styles.readonlyInput]}
            editable={phoneEditing}
          />
          {!phoneEditing ? (
            <TouchableOpacity
              style={styles.codeBtn}
              onPress={() => {
                setPhoneEditing(true);
                setSentCode(null);
                setCodeInput("");
                setPhoneVerified(false);
                setVerifiedPhone(null);
              }}
            >
              <Text style={styles.codeBtnText}>변경</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.codeBtn} onPress={handleSendCode}>
              <Text style={styles.codeBtnText}>인증번호 발송</Text>
            </TouchableOpacity>
          )}
        </View>

        {phoneEditing ? (
          <>
            <View style={styles.row}>
              <TextInput
                value={codeInput}
                onChangeText={setCodeInput}
                placeholder="인증번호 입력"
                keyboardType="number-pad"
                style={[styles.input, styles.flex]}
              />
              <TouchableOpacity style={styles.codeBtn} onPress={handleVerifyCode}>
                <Text style={styles.codeBtnText}>
                  {phoneVerified ? "인증완료" : "인증 확인"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={phoneVerified ? styles.success : styles.helper}>
              {phoneVerified ? "전화번호 인증 완료" : "전화번호 인증이 필요합니다."}
            </Text>
          </>
        ) : null}

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
        >
          <Text style={styles.saveButtonText}>{saving ? "저장 중..." : "저장"}</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: { marginHorizontal: spacing.lg, gap: spacing.sm },
  label: { fontWeight: "700", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  readonlyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  readonlyText: { color: colors.subtext, fontSize: 14 },
  readonlyInput: { opacity: 0.6 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  codeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  codeBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  helper: { color: colors.subtext, fontSize: 12 },
  success: { color: colors.success, fontSize: 12 },
  error: { color: colors.danger, fontSize: 12 },
  desc: { color: colors.subtext, fontSize: 12 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  photoPreview: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.border },
  photoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.border,
  },
  photoButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  photoButtonText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  saveButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.text,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { color: "#FFFFFF", fontWeight: "700" },
});
