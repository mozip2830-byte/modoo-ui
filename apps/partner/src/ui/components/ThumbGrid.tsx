import React from "react";
import { FlatList, Image, StyleSheet, TouchableOpacity } from "react-native";

import { radius, spacing } from "@/src/ui/tokens";

type ThumbItem = {
  id: string;
  uri: string;
};

type ThumbGridProps = {
  items: ThumbItem[];
  onPress?: (index: number) => void;
};

export function ThumbGrid({ items, onPress }: ThumbGridProps) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={3}
      scrollEnabled={false}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      renderItem={({ item, index }) => (
        <TouchableOpacity
          style={styles.thumbWrap}
          onPress={() => onPress && onPress(index)}
          activeOpacity={0.8}
        >
          <Image source={{ uri: item.uri }} style={styles.thumb} />
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { gap: spacing.sm },
  thumbWrap: { flex: 1, aspectRatio: 1 },
  thumb: { width: "100%", height: "100%", borderRadius: radius.sm },
});
