import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  listAll,
  getMetadata,
} from "firebase/storage";

import { storage } from "@/src/firebase";

type PickImagesOptions = {
  maxCount: number;
};

type UploadImageInput = {
  uri: string;
  storagePath: string;
  contentType?: string;
};

export async function pickImages(options: PickImagesOptions) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Media library permission is required.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsMultipleSelection: true,
    selectionLimit: options.maxCount,
  });

  if (result.canceled || !result.assets?.length) return [];
  return result.assets.slice(0, options.maxCount);
}

export async function uploadImage(input: UploadImageInput) {
  const response = await fetch(input.uri);
  const blob = await response.blob();

  const storageRef = ref(storage, input.storagePath);
  await uploadBytes(storageRef, blob, {
    contentType: input.contentType ?? "image/jpeg",
  });

  const url = await getDownloadURL(storageRef);
  const info = await FileSystem.getInfoAsync(input.uri);
  const sizeBytes = info.exists && "size" in info ? Number((info as any).size) : undefined;

  return { url, sizeBytes };
}

export async function deleteStorageFile(storagePath: string) {
  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);
}

// Storage-only photo types
export type StoragePhotoItem = {
  id: string;
  url: string;
  thumbUrl: string | null;
  storagePath: string;
  thumbPath: string | null;
  isPrimary: boolean;
  timeCreated: string | null;
};

/**
 * List all photos from Storage (Storage-only approach).
 * Primary photo is determined by the filename "profile.jpg"
 */
export async function listStoragePhotos(partnerId: string): Promise<StoragePhotoItem[]> {
  const photosRef = ref(storage, `partners/${partnerId}/photos`);
  const thumbsRef = ref(storage, `partners/${partnerId}/photos/thumbs`);

  try {
    const [photosResult, thumbsResult] = await Promise.all([
      listAll(photosRef),
      listAll(thumbsRef).catch(() => ({ items: [] })),
    ]);

    // Build a map of thumb URLs
    const thumbMap = new Map<string, string>();
    for (const thumbItem of thumbsResult.items) {
      const thumbUrl = await getDownloadURL(thumbItem);
      const baseName = thumbItem.name.replace(/\.jpg$/i, "");
      thumbMap.set(baseName, thumbUrl);
    }

    const photos: StoragePhotoItem[] = [];

    for (const item of photosResult.items) {
      // Skip if it's a directory marker or thumb
      if (item.name === "thumbs" || item.name.startsWith(".")) continue;

      const baseName = item.name.replace(/\.jpg$/i, "");
      const isPrimary = baseName === "profile";
      const storagePath = `partners/${partnerId}/photos/${item.name}`;
      const thumbPath = thumbMap.has(baseName)
        ? `partners/${partnerId}/photos/thumbs/${item.name}`
        : null;

      try {
        const [url, metadata] = await Promise.all([
          getDownloadURL(item),
          getMetadata(item).catch(() => null),
        ]);

        photos.push({
          id: baseName,
          url,
          thumbUrl: thumbMap.get(baseName) ?? null,
          storagePath,
          thumbPath,
          isPrimary,
          timeCreated: metadata?.timeCreated ?? null,
        });
      } catch (err) {
        console.warn("[storage] Failed to get photo:", item.name, err);
      }
    }

    // Sort: primary first, then by time (newest first)
    photos.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      const timeA = a.timeCreated ? new Date(a.timeCreated).getTime() : 0;
      const timeB = b.timeCreated ? new Date(b.timeCreated).getTime() : 0;
      return timeB - timeA;
    });

    return photos;
  } catch (err) {
    console.error("[storage] Failed to list photos:", err);
    return [];
  }
}

/**
 * Copy a photo to profile.jpg to set it as primary (Storage-only approach).
 * Downloads the source, re-uploads as profile.jpg
 */
export async function setStoragePrimaryPhoto(
  partnerId: string,
  sourceUrl: string
): Promise<{ url: string; thumbUrl: string | null }> {
  // Download source image
  const response = await fetch(sourceUrl);
  const blob = await response.blob();

  // Upload as profile.jpg
  const profilePath = `partners/${partnerId}/photos/profile.jpg`;
  const profileRef = ref(storage, profilePath);
  await uploadBytes(profileRef, blob, { contentType: "image/jpeg" });
  const url = await getDownloadURL(profileRef);

  return { url, thumbUrl: null };
}
