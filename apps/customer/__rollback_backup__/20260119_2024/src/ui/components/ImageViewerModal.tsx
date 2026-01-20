import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View, Image } from "react-native";

import { colors, spacing } from "@/src/ui/tokens";

type ImageViewerModalProps = {
  visible: boolean;
  imageUrl?: string | null;
  onClose: () => void;
};

export function ImageViewerModal({ visible, imageUrl, onClose }: ImageViewerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>닫기</Text>
        </TouchableOpacity>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "90%", height: "70%", resizeMode: "contain" },
  closeBtn: {
    position: "absolute",
    top: spacing.xl,
    right: spacing.lg,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  closeText: { fontWeight: "700", color: colors.text },
});
