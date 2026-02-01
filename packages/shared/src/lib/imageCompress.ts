import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";

declare const require: (id: string) => any;

type PrepareOptions = {
  uri: string;
  maxSize: number;
  quality: number;
};

type PreparedImage = {
  uri: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
};

async function getFileSize(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in info) {
      const size = (info as any).size;
      return typeof size === "number" ? size : undefined;
    }
    return undefined;
  } catch (err) {
    console.warn("[imageCompress] getFileSize fallback", err);
    return undefined;
  }
}

function getResizeAction(width?: number, height?: number, maxSize?: number) {
  if (!width || !height || !maxSize) return [];
  const longest = Math.max(width, height);
  if (longest <= maxSize) return [];
  if (width >= height) {
    return [{ resize: { width: maxSize } }];
  }
  return [{ resize: { height: maxSize } }];
}

function loadManipulator() {
  try {
    return require("expo-image-manipulator");
  } catch (err) {
    console.warn("[imageCompress] expo-image-manipulator unavailable", err);
    return null;
  }
}

export async function prepareImageForUpload(options: PrepareOptions): Promise<PreparedImage> {
  if (Platform.OS === "web") {
    return {
      uri: options.uri,
      sizeBytes: await getFileSize(options.uri),
    };
  }

  const ImageManipulator = loadManipulator();
  if (!ImageManipulator) {
    return {
      uri: options.uri,
      sizeBytes: await getFileSize(options.uri),
    };
  }

  try {
    const normalized = await ImageManipulator.manipulateAsync(
      options.uri,
      [],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 1 }
    );

    const resizeActions = getResizeAction(normalized.width, normalized.height, options.maxSize);
    const result = await ImageManipulator.manipulateAsync(
      normalized.uri,
      resizeActions,
      {
        compress: options.quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    const sizeBytes = await getFileSize(result.uri);
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      sizeBytes,
    };
  } catch (err) {
    console.warn("[imageCompress] prepare fallback", err);
    return {
      uri: options.uri,
      sizeBytes: await getFileSize(options.uri),
    };
  }
}

export async function autoRecompress(options: PrepareOptions, targetBytes = 1024 * 1024) {
  let current = await prepareImageForUpload(options);
  if (!current.sizeBytes || current.sizeBytes <= targetBytes) {
    return current;
  }

  const retries = [options.quality - 0.1, options.quality - 0.2];
  for (const quality of retries) {
    if (quality <= 0.35) break;
    current = await prepareImageForUpload({
      uri: current.uri,
      maxSize: options.maxSize,
      quality,
    });
    if (!current.sizeBytes || current.sizeBytes <= targetBytes) {
      break;
    }
  }

  return current;
}

export async function createThumb(uri: string, maxSize = 320, quality = 0.55) {
  return prepareImageForUpload({ uri, maxSize, quality });
}
