import React from "react";
import { StyleSheet, Text, TouchableOpacity, TouchableOpacityProps } from "react-native";

import { colors, radius, spacing } from "@/src/ui/tokens";

type ButtonProps = TouchableOpacityProps & {
  label: string;
};

export function PrimaryButton({ label, style, disabled, ...props }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.primary, disabled && styles.disabled, style]}
      disabled={disabled}
      {...props}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({ label, style, disabled, ...props }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.secondary, disabled && styles.disabled, style]}
      disabled={disabled}
      {...props}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  secondary: {
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
  disabled: {
    opacity: 0.6,
  },
});
