import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";

import { colors, radius, shadow, spacing } from "@/src/ui/tokens";

export function Card({ style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} {...props} />;
}

export function CardRow({ style, ...props }: ViewProps) {
  return <View style={[styles.row, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
