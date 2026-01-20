import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/src/ui/tokens";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
};

export function AppHeader({ title, subtitle, rightAction }: AppHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightAction ? <View style={styles.action}>{rightAction}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  textWrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: spacing.xs, color: colors.subtext, fontSize: 12 },
  action: { marginLeft: spacing.md },
});
