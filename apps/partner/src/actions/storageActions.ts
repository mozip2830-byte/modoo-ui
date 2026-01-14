import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

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
    mediaTypes: ImagePicker.MediaType.Images,
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
