import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/src/ui/tokens";

type ChipProps = {
  label: string;
  tone?: "default" | "success" | "warning";
};

export function Chip({ label, tone = "default" }: ChipProps) {
  return (
    <View style={[styles.base, styles[tone]]}>
      <Text style={[styles.text, styles[`${tone}Text`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
  },
  default: { backgroundColor: colors.chipBg },
  success: { backgroundColor: "#DCFCE7" },
  warning: { backgroundColor: "#FEF3C7" },
  text: { fontSize: 12, fontWeight: "700" },
  defaultText: { color: colors.primary },
  successText: { color: colors.success },
  warningText: { color: colors.warning },
});
