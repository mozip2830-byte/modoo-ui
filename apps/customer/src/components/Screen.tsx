import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type SafeAreaViewProps } from "react-native-safe-area-context";

import { colors, spacing } from "@/src/ui/tokens";

export type ScreenProps = SafeAreaViewProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Enable ScrollView wrapper. Default true. Set false for FlatList/SectionList screens. */
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Enable KeyboardAvoidingView. Default: iOS true, Android false */
  keyboardAvoiding?: boolean;
};

export function Screen({
  children,
  style,
  scroll = true,
  contentContainerStyle,
  keyboardAvoiding = Platform.OS === "ios",
  edges = ["top"],
  ...rest
}: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      removeClippedSubviews={true}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <SafeAreaView edges={edges} style={[styles.container, style]} {...rest}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
});
