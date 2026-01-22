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
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useRouter } from "expo-router";

import { db } from "@/src/firebase";
import { useAuthUid } from "@/src/lib/useAuthUid";
import { usePartnerUser } from "@/src/lib/usePartnerUser";
import { pickImages, uploadImage } from "@/src/actions/storageActions";
import { autoRecompress } from "@/src/lib/imageCompress";
import {
  validateBusinessNumber,
  normalizeBusinessNumber,
  formatBusinessNumber,
} from "@/src/lib/validateBusinessNumber";
import { AppHeader } from "@/src/ui/components/AppHeader";
import { Card } from "@/src/ui/components/Card";
import { PrimaryButton, SecondaryButton } from "@/src/ui/components/Buttons";
import { Chip } from "@/src/ui/components/Chip";
import { colors, spacing } from "@/src/ui/tokens";
import { ImageViewerModal } from "@/src/ui/components/ImageViewerModal";
import { Screen } from "@/src/components/Screen";

const MAX_SIZE = 1600;
const QUALITY = 0.75;

type VerificationDoc = {
  status?: "검수중" | "승인" | "반려";
  rejectReason?: string | null;
  docs?: {
    businessLicenseUrl?: string | null;
  };
};

export default function PartnerVerificationScreen() {
  const router = useRouter();
  const { uid } = useAuthUid();
  const { user } = usePartnerUser(uid);
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [licenseUri, setLicenseUri] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verification, setVerification] = useState<VerificationDoc | null>(null);
  const [bizNumberValid, setBizNumberValid] = useState<boolean | null>(null);
  const [bizNumberError, setBizNumberError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      doc(db, "partnerVerifications", uid),
      (snap) => {
        if (!snap.exists()) {
          setVerification(null);
          return;
        }
        const data = snap.data() as VerificationDoc;
        setVerification(data);
      },
      (err) => {
        console.error("[partner][verification] load error", err);
      }
    );
    return () => {
      if (unsub) unsub();
    };
  }, [uid]);

  const status = verification?.status ?? user?.verificationStatus ?? "승인";
  const canSubmit = status === "반려";
  const canDevApprove = __DEV__ && uid && uid === process.env.EXPO_PUBLIC_DEV_APPROVER_UID;

  const handleValidateBusinessNumber = () => {
    const normalized = normalizeBusinessNumber(businessNumber);
    if (!normalized) {
      setBizNumberValid(null);
      setBizNumberError("사업자등록번호를 입력해 주세요.");
      return;
    }
    if (normalized.length !== 10) {
      setBizNumberValid(false);
      setBizNumberError("사업자등록번호는 10자리입니다.");
      return;
    }
    if (validateBusinessNumber(normalized)) {
      setBizNumberValid(true);
      setBizNumberError(null);
      setBusinessNumber(formatBusinessNumber(normalized));
    } else {
      setBizNumberValid(false);
      setBizNumberError("유효하지 않은 사업자등록번호입니다.");
    }
  };

  const handleBusinessNumberChange = (text: string) => {
    setBusinessNumber(text);
    setBizNumberValid(null);
    setBizNumberError(null);
  };

  const handlePick = async (setter: (uri: string | null) => void) => {
    const assets = await pickImages({ maxCount: 1 });
    if (assets.length) {
      setter(assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!uid) {
      Alert.alert("로그인이 필요합니다");
      return;
    }
    if (!companyName.trim() || !ownerName.trim() || !businessNumber.trim() || !phone.trim()) {
      Alert.alert("필수 정보를 모두 입력해 주세요.");
      return;
    }
    if (!licenseUri) {
      Alert.alert("사업자등록증을 업로드해 주세요.");
      return;
    }

    // Validate business number before submit
    const normalizedBizNum = normalizeBusinessNumber(businessNumber);
    const isValidBizNumber = validateBusinessNumber(normalizedBizNum);
    if (!isValidBizNumber) {
      Alert.alert("사업자등록번호 오류", "유효한 사업자등록번호를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const licensePrepared = await autoRecompress(
        { uri: licenseUri, maxSize: MAX_SIZE, quality: QUALITY },
        2 * 1024 * 1024
      );
      const licensePath = `verifications/${uid}/business_license.jpg`;
      const licenseUploaded = await uploadImage({
        uri: licensePrepared.uri,
        storagePath: licensePath,
        contentType: "image/jpeg",
      });

      const verificationRef = doc(db, "partnerVerifications", uid);
      const existing = await getDoc(verificationRef);
      const basePayload = {
        uid,
        companyName: companyName.trim(),
        ownerName: ownerName.trim(),
        businessNumber: normalizedBizNum,
        phone: phone.trim(),
        address: address.trim(),
        docs: {
          businessLicenseUrl: licenseUploaded.url,
        },
        submittedAt: serverTimestamp(),
      };

      if (existing.exists()) {
        await setDoc(verificationRef, basePayload, { merge: true });
      } else {
        await setDoc(
          verificationRef,
          {
            ...basePayload,
            status: "검수중",
          },
          { merge: true }
        );
      }

      Alert.alert("제출 완료", "서류가 접수되었습니다. 검수 완료까지 기다려 주세요.");
      router.back();
    } catch (err) {
      console.error("[partner][verification] submit error", err);
      Alert.alert("제출 실패", "서류 제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDevApprove = async () => {
    if (!uid) return;
    await setDoc(
      doc(db, "partnerVerifications", uid),
      { status: "승인", reviewedAt: serverTimestamp(), reviewer: "dev" },
      { merge: true }
    );
  };

  const statusLabel = useMemo(() => {
    if (status === "검수중") return "검수중";
    if (status === "승인") return "승인";
    if (status === "반려") return "반려";
    return "승인";
  }, [status]);

  const statusTone = status === "승인" ? "success" : status === "반려" ? "warning" : "default";

  return (
    <Screen style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title="사업자 인증" subtitle="서류를 제출하고 인증을 완료해 주세요." />
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusTitle}>현재 상태</Text>
            <Chip label={statusLabel} tone={statusTone} />
          </View>
          {status === "검수중" ? (
            <Text style={styles.notice}>
              서류 확인 중입니다. 보통 1~12시간(영업시간 기준) 내 완료됩니다.
            </Text>
          ) : null}
          {status === "반려" ? (
            <Text style={styles.notice}>반려된 서류를 다시 제출해 주세요.</Text>
          ) : null}
        </Card>

        {status === "승인" ? (
          <Card style={styles.doneCard}>
            <Text style={styles.doneTitle}>인증이 완료되었습니다</Text>
            <Text style={styles.notice}>이제 견적 제안을 진행할 수 있습니다.</Text>
          </Card>
        ) : status === "검수중" ? (
          <Card style={styles.formCard}>
            <Text style={styles.step}>1 제출 · 2 검수 · 3 완료</Text>
            <Text style={styles.notice}>
              서류 확인 중입니다. 보통 1~12시간(영업시간 기준) 내 완료됩니다.
            </Text>
            <Text style={styles.label}>제출 서류</Text>
            {verification?.docs?.businessLicenseUrl ? (
              <TouchableOpacity
                onPress={() => setPreviewUrl(verification.docs?.businessLicenseUrl ?? null)}
              >
                <Image source={{ uri: verification.docs.businessLicenseUrl }} style={styles.preview} />
              </TouchableOpacity>
            ) : null}
            <SecondaryButton label="문의하기" onPress={() => router.push("/(partner)/support")} />
          </Card>
        ) : (
          <Card style={styles.formCard}>
            <Text style={styles.step}>1 제출 · 2 검수 · 3 완료</Text>
            {status === "반려" && verification?.rejectReason ? (
              <Text style={styles.reject}>반려 사유: {verification.rejectReason}</Text>
            ) : null}
            <Text style={styles.label}>상호</Text>
            <TextInput
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="상호를 입력해 주세요"
              style={styles.input}
              editable={canSubmit}
            />
            <Text style={styles.label}>대표자명</Text>
            <TextInput
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="대표자명을 입력해 주세요"
              style={styles.input}
              editable={canSubmit}
            />
            <Text style={styles.label}>사업자등록번호</Text>
            <View style={styles.bizNumRow}>
              <TextInput
                value={businessNumber}
                onChangeText={handleBusinessNumberChange}
                onBlur={handleValidateBusinessNumber}
                placeholder="000-00-00000"
                keyboardType="number-pad"
                style={[
                  styles.input,
                  styles.bizNumInput,
                  bizNumberValid === true && styles.inputSuccess,
                  bizNumberValid === false && styles.inputError,
                ]}
                editable={canSubmit}
              />
              <TouchableOpacity
                style={[
                  styles.validateBtn,
                  bizNumberValid === true && styles.validateBtnSuccess,
                ]}
                onPress={handleValidateBusinessNumber}
                disabled={!canSubmit}
              >
                <Text style={styles.validateBtnText}>
                  {bizNumberValid === true ? "인증완료" : "인증"}
                </Text>
              </TouchableOpacity>
            </View>
            {bizNumberError ? (
              <Text style={styles.bizNumError}>{bizNumberError}</Text>
            ) : bizNumberValid === true ? (
              <Text style={styles.bizNumSuccess}>유효한 사업자등록번호입니다.</Text>
            ) : null}
            <Text style={styles.label}>연락처</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="010-0000-0000"
              style={styles.input}
              editable={canSubmit}
            />
            <Text style={styles.label}>주소(선택)</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="주소를 입력해 주세요"
              style={styles.input}
              editable={canSubmit}
            />

            <Text style={styles.label}>사업자등록증(필수)</Text>
            <SecondaryButton label="사업자등록증 업로드" onPress={() => handlePick(setLicenseUri)} />
            {licenseUri ? (
              <TouchableOpacity onPress={() => setPreviewUrl(licenseUri)}>
                <Image source={{ uri: licenseUri }} style={styles.preview} />
              </TouchableOpacity>
            ) : null}

            <PrimaryButton
              label={submitting ? "제출 중..." : "서류 제출하기"}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting || bizNumberValid !== true}
            />
            <SecondaryButton label="문의하기" onPress={() => router.push("/(partner)/support")} />
          </Card>
        )}

        {canDevApprove ? (
          <Card style={styles.devCard}>
            <Text style={styles.devTitle}>개발자 승인 전용</Text>
            <PrimaryButton label="임시 승인 처리" onPress={handleDevApprove} />
          </Card>
        ) : null}

      <ImageViewerModal
        visible={Boolean(previewUrl)}
        imageUrl={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  statusCard: { gap: spacing.sm },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusTitle: { fontWeight: "700", color: colors.text },
  notice: { color: colors.subtext, fontSize: 12 },
  doneCard: { gap: spacing.sm },
  doneTitle: { fontWeight: "800", color: colors.text },
  formCard: { gap: spacing.sm },
  step: { color: colors.subtext, fontSize: 12 },
  reject: { color: colors.danger, fontSize: 12 },
  label: { fontWeight: "700", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  bizNumRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  bizNumInput: {
    flex: 1,
  },
  inputSuccess: {
    borderColor: colors.primary,
  },
  inputError: {
    borderColor: colors.danger,
  },
  validateBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: "center",
  },
  validateBtnSuccess: {
    backgroundColor: "#10B981",
  },
  validateBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  bizNumError: {
    color: colors.danger,
    fontSize: 12,
    marginTop: -spacing.xs,
  },
  bizNumSuccess: {
    color: "#10B981",
    fontSize: 12,
    marginTop: -spacing.xs,
  },
  preview: { width: "100%", height: 160, borderRadius: 12, marginTop: spacing.xs },
  devCard: { gap: spacing.sm },
  devTitle: { fontWeight: "700", color: colors.text },
});
