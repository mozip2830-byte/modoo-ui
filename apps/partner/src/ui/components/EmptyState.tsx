import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/src/ui/tokens";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  desc: { marginTop: spacing.xs, fontSize: 12, color: colors.subtext, textAlign: "center" },
  action: { marginTop: spacing.md },
});
