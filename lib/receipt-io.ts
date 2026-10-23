import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { getApiBaseUrl } from "@/constants/oauth";
import type { ReceiptDraft, ReceiptImage } from "./receipt";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function byteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function abortError(): Error {
  const error = new Error("Receipt scan cancelled.");
  error.name = "AbortError";
  return error;
}

function selectedImage(asset: ImagePicker.ImagePickerAsset): ReceiptImage {
  const image = asset.base64;
  if (!image)
    throw new Error(
      "The selected receipt could not be read. Please try again.",
    );
  if (byteLength(image) > MAX_IMAGE_BYTES) {
    throw new Error("Please choose a JPG or PNG receipt smaller than 8 MB.");
  }
  return {
    uri: asset.uri,
    image,
    // Expo ImagePicker documents `base64` as JPEG data, even when an original
    // library asset reports a different source MIME type such as HEIC.
    mimeType: "image/jpeg",
    name: asset.fileName || undefined,
  };
}

export async function chooseReceipt(
  source: "camera" | "library" | "file",
): Promise<ReceiptImage | null> {
  if (source === "file") {
    const selection = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (selection.canceled) return null;
    const asset = selection.assets[0];
    if (!asset || !/\.(jpe?g|png)$/i.test(asset.name))
      throw new Error("Choose a JPG or PNG receipt image file.");
    if (asset.size && asset.size > MAX_IMAGE_BYTES)
      throw new Error("Please choose a JPG or PNG receipt smaller than 8 MB.");
    const file = new File(asset.uri);
    if (!file.exists || file.size <= 0)
      throw new Error("The selected receipt file could not be read.");
    if (file.size > MAX_IMAGE_BYTES)
      throw new Error("Please choose a JPG or PNG receipt smaller than 8 MB.");
    const image = await file.base64();
    if (byteLength(image) > MAX_IMAGE_BYTES)
      throw new Error("Please choose a JPG or PNG receipt smaller than 8 MB.");
    const mimeType = image.startsWith("/9j/")
      ? "image/jpeg"
      : image.startsWith("iVBORw0KGgo")
        ? "image/png"
        : undefined;
    if (!mimeType)
      throw new Error("The selected file is not a valid JPG or PNG image.");
    return {
      uri: asset.uri,
      image,
      mimeType,
      name: asset.name,
      temporaryCopy: true,
    };
  }
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        "Camera access is denied. Allow Pocketly camera access in device settings, or choose a receipt photo instead.",
      );
    }
  }
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          cameraType: ImagePicker.CameraType.back,
          base64: true,
          quality: 0.85,
          exif: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: false,
          base64: true,
          quality: 0.85,
          exif: false,
        });
  if (result.canceled) return null;
  return selectedImage(result.assets[0]);
}

export async function scanReceipt(
  image: ReceiptImage,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<ReceiptDraft> {
  if (!image.image || !image.mimeType) {
    throw new Error(
      "The selected receipt is unavailable. Please choose it again.",
    );
  }
  if (byteLength(image.image) > MAX_IMAGE_BYTES) {
    throw new Error("Please choose a JPG or PNG receipt smaller than 8 MB.");
  }
  if (signal?.aborted) throw abortError();

  onProgress(5);
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/api/receipts/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: image.image, mimeType: image.mimeType }),
      signal,
    });
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw abortError();
    }
    throw new Error("Receipt scan could not be completed. Please try again.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Receipt scan could not be completed. Please try again.");
  }
  if (signal?.aborted) throw abortError();
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Receipt scan could not be completed. Please try again.";
    throw new Error(message);
  }
  const draft = body as { text?: unknown; confidence?: unknown } | null;
  if (
    !draft ||
    typeof draft.text !== "string" ||
    typeof draft.confidence !== "number"
  ) {
    throw new Error("Receipt scan could not be completed. Please try again.");
  }
  onProgress(100);
  return body as ReceiptDraft;
}

/** Never delete a user's source photo; only remove our explicit picker cache copy. */
export function releaseReceipt(image: ReceiptImage): void {
  if (!image.temporaryCopy) return;
  try {
    const file = new File(image.uri);
    if (file.exists) file.delete();
  } catch {
    /* Best-effort cache cleanup only. */
  }
}
