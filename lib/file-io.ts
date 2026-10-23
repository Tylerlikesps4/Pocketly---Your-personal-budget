import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function chooseCSV(): Promise<{
  text: string;
  name: string;
} | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Please choose a .csv file.");
  }
  if ((asset.size || 0) > 10 * 1024 * 1024) {
    throw new Error("Please choose a CSV smaller than 10 MB.");
  }
  const text = await new File(asset.uri).text();
  return { text, name: asset.name };
}

export async function downloadCSV(text: string, name: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("File sharing is not available on this device.");
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write("\uFEFF" + text);
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
    dialogTitle: `Save ${name}`,
  });
  // Keep the cached file available to the recipient; the OS manages cache eviction.
}
