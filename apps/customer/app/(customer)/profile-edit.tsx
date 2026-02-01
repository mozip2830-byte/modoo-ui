import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { updateEmail } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { generateVerificationCode } from "@modoo/shared";
import { Screen } from "@/src/components/Screen";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { colors, spacing } from "@/src/ui/tokens";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { auth, db } from "@/src/firebase";
import { pickImages, uploadImage, deleteStorageFile } from "@/src/actions/storageActions";
import { subscribeAddressDraft, type AddressDraft } from "@/src/lib/addressDraftStore";
import { SERVICE_REGIONS } from "@/src/constants/serviceRegions";
import { SERVICE_REGION_CITIES } from "@/src/constants/serviceRegionCities";

type ProfileData = {
  name?: string;
  email?: string;
  phone?: string;
  phoneVerified?: boolean;
  nickname?: string;
  photoUrl?: string;
  photoPath?: string;
  addressRoad?: string;
  addressDong?: string;
};

function deriveRegionKeyFromAddress(addressRoad: string) {
  const normalized = addressRoad.replace(/[()]/g, " ").trim();
  if (!normalized) return "";
  const province = SERVICE_REGIONS.find((item) => normalized.includes(item)) ?? null;
  if (province && SERVICE_REGION_CITIES[province]) {
    const city = SERVICE_REGION_CITIES[province].find((item) => normalized.includes(item)) ?? null;
    return city ? `${province} ${city}` : "";
  }
  for (const [key, cities] of Object.entries(SERVICE_REGION_CITIES)) {
    const city = cities.find((item) => normalized.includes(item));
    if (city) return `${key} ${city}`;
  }
  return "";
}

export default function ProfileEditScreen() {
  const router = useRouter();
  const { uid } = useAuthUid();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [addressRoad, setAddressRoad] = useState("");
  const [addressDong, setAddressDong] = useState("");

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
          setEmail(data.email ?? "");
          setNickname(data.nickname ?? "");
          setPhone(data.phone ?? "");
          setPhotoUrl(data.photoUrl ?? null);
          setPhotoPath(data.photoPath ?? null);
          setAddressRoad(data.addressRoad ?? "");
          setAddressDong(data.addressDong ?? "");
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
  const currentEmail = profile?.email ?? "";
  const currentAddressRoad = profile?.addressRoad ?? "";
  const currentAddressDong = profile?.addressDong ?? "";

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
    const code = generateVerificationCode();
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
      const prevDisplayName =
        (profile?.nickname ?? "").trim() || (profile?.name ?? "").trim() || "";
      const nextDisplayName = nickname.trim() || (profile?.name ?? "").trim() || "";
      const shouldSyncName = Boolean(nextDisplayName && nextDisplayName !== prevDisplayName);
      const shouldSyncPhoto = Boolean(photoUrl && photoUrl !== (profile?.photoUrl ?? null));
      const emailChanged = email.trim() !== currentEmail;
      const addressChanged =
        addressRoad.trim() !== currentAddressRoad || addressDong.trim() !== currentAddressDong;

      const updates: ProfileData & { updatedAt: unknown } = {
        nickname: nickname.trim(),
        updatedAt: serverTimestamp(),
      };

      if (emailChanged) {
        if (!email.trim()) {
          setError("이메일을 입력해 주세요.");
          setSaving(false);
          return;
        }
        if (auth.currentUser) {
          await updateEmail(auth.currentUser, email.trim());
        }
        updates.email = email.trim();
      }

      if (photoUrl) {
        updates.photoUrl = photoUrl;
        if (photoPath) {
          updates.photoPath = photoPath;
        }
      }

      if (phoneEditing && phone.trim() !== currentPhone) {
        updates.phone = phone.trim();
        updates.phoneVerified = true;
      }

      if (addressChanged) {
        if (!addressRoad.trim() || !addressDong.trim()) {
          setError("주소를 시/군 단위까지 선택해 주세요.");
          setSaving(false);
          return;
        }
        updates.addressRoad = addressRoad.trim();
        updates.addressDong = addressDong.trim();
      }

      await setDoc(doc(db, "customerUsers", uid), updates, { merge: true });
      setProfile((prev) => ({ ...(prev ?? {}), ...updates }));
      if (phoneEditing && phone.trim() !== currentPhone) {
        setVerifiedPhone(phone.trim());
        setPhoneVerified(true);
      }
      setPhoneEditing(false);
      if (shouldSyncName || shouldSyncPhoto) {
        const syncPayload: Record<string, unknown> = {};
        if (shouldSyncName) syncPayload.customerName = nextDisplayName;
        if (shouldSyncPhoto) syncPayload.customerPhotoUrl = photoUrl;

        const applyBatchUpdate = async (snap: Awaited<ReturnType<typeof getDocs>>) => {
          let batch = writeBatch(db);
          let count = 0;
          for (const docSnap of snap.docs) {
            batch.update(docSnap.ref, syncPayload);
            count += 1;
            if (count >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          if (count > 0) {
            await batch.commit();
          }
        };

        try {
          const requestSnap = await getDocs(
            query(collection(db, "requests"), where("customerId", "==", uid))
          );
          await applyBatchUpdate(requestSnap);
        } catch (err) {
          console.warn("[customer][profile-edit] requests name sync error", err);
        }

        try {
          const chatSnap = await getDocs(
            query(collection(db, "chats"), where("customerId", "==", uid))
          );
          await applyBatchUpdate(chatSnap);
        } catch (err) {
          console.warn("[customer][profile-edit] chats name sync error", err);
        }
      }
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

        <Text style={styles.label}>이메일</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="example@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

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


        <Text style={styles.label}>주소</Text>
        <TouchableOpacity
          style={styles.addressInput}
          onPress={() => router.push("/(customer)/requests/address-search")}
        >
          <Text style={addressRoad ? styles.addressText : styles.addressPlaceholder}>
            {addressRoad || "주소를 검색해 주세요 (시/군까지)"}
          </Text>
        </TouchableOpacity>
        {addressDong ? <Text style={styles.helper}>선택 지역: {addressDong}</Text> : null}

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
  addressInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.card,
  },
  addressText: { color: colors.text, fontSize: 14 },
  addressPlaceholder: { color: colors.subtext, fontSize: 14 },
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
