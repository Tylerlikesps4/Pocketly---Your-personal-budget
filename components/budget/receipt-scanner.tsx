import React, { useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, View } from "react-native";
import type { ReceiptDraft, ReceiptImage } from "@/lib/receipt";
import { chooseReceipt, releaseReceipt, scanReceipt } from "@/lib/receipt-io";
import { Button, C, Card, Dialog, Icon, Txt } from "./ui";

export function ReceiptScanner({
  open,
  onClose,
  onReview,
}: {
  open: boolean;
  onClose: () => void;
  onReview: (draft: ReceiptDraft) => void;
}) {
  const mounted = useRef(true);
  const controller = useRef<AbortController | undefined>(undefined);
  const currentImage = useRef<ReceiptImage | null>(null);
  const [image, setImage] = useState<ReceiptImage | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [showText, setShowText] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (currentImage.current) releaseReceipt(currentImage.current);
    };
  }, []);

  function resetReceipt(receipt: ReceiptImage | null = image) {
    controller.current?.abort();
    controller.current = undefined;
    if (receipt) releaseReceipt(receipt);
    if (currentImage.current === receipt) currentImage.current = null;
    if (!mounted.current) return;
    setImage(null);
    setDraft(null);
    setProgress(0);
    setScanning(false);
    setShowText(false);
    setError("");
  }

  function close() {
    resetReceipt();
    onClose();
  }

  async function choose(source: "camera" | "library" | "file") {
    try {
      setError("");
      const next = await chooseReceipt(source);
      if (!mounted.current || !next) return;
      if (currentImage.current) releaseReceipt(currentImage.current);
      currentImage.current = next;
      setImage(next);
      setDraft(null);
      setProgress(0);
      setShowText(false);
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not choose that receipt.",
      );
    }
  }

  async function scan() {
    if (!image || scanning) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setError("");
    setDraft(null);
    setProgress(1);
    setScanning(true);
    try {
      const result = await scanReceipt(
        image,
        (value) => {
          if (mounted.current && !nextController.signal.aborted)
            setProgress(value);
        },
        nextController.signal,
      );
      if (!mounted.current || nextController.signal.aborted) return;
      setDraft(result);
    } catch (cause) {
      if (!mounted.current || nextController.signal.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Receipt scan could not be completed. Please try again.",
      );
    } finally {
      if (mounted.current && controller.current === nextController) {
        controller.current = undefined;
        setScanning(false);
      }
    }
  }

  function cancelScan() {
    controller.current?.abort();
  }

  function useDetails() {
    if (!draft) return;
    onReview(draft);
    resetReceipt();
  }

  const privacy =
    Platform.OS === "web"
      ? "Browser: OCR runs on this device and downloads English language data."
      : "Native: your selected receipt is sent temporarily to the app server for OCR and is not stored.";

  return (
    <Dialog
      visible={open}
      title="Scan a receipt"
      subtitle="Review every detail before adding an expense."
      onClose={close}
    >
      <Card style={{ backgroundColor: C.bg, padding: 15, marginBottom: 16 }}>
        <View
          style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
        >
          <Icon name="shield-checkmark-outline" color={C.mint} />
          <Txt style={{ color: C.muted, fontSize: 12, flex: 1 }}>{privacy}</Txt>
        </View>
      </Card>

      {!image ? (
        <View style={{ gap: 10 }}>
          <Button
            label="Take photo"
            icon="camera-outline"
            onPress={() => choose("camera")}
          />
          <Button
            label="Choose photo"
            icon="images-outline"
            secondary
            onPress={() => choose("library")}
          />
          <Button
            label="Choose image file"
            icon="document-outline"
            secondary
            onPress={() => choose("file")}
          />
          <Txt style={{ color: C.muted, fontSize: 11, textAlign: "center" }}>
            JPG or PNG only, up to 8 MB.
          </Txt>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Image
            source={{ uri: image.uri }}
            accessibilityLabel="Selected receipt preview"
            resizeMode="contain"
            style={{
              width: "100%",
              height: 220,
              borderRadius: 10,
              backgroundColor: C.bg,
            }}
          />
          {!draft && !scanning && (
            <>
              <Button label="Scan receipt" icon="scan-outline" onPress={scan} />
              <Button
                label="Choose a different photo"
                icon="images-outline"
                secondary
                onPress={() => choose("library")}
              />
            </>
          )}
          {scanning && (
            <Card style={{ backgroundColor: C.bg, padding: 14 }}>
              <Txt style={{ fontWeight: "600" }}>
                Reading receipt… {progress}%
              </Txt>
              <View
                style={{
                  height: 6,
                  borderRadius: 4,
                  backgroundColor: C.line,
                  marginTop: 10,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    backgroundColor: C.purple,
                  }}
                />
              </View>
              <Button
                label="Cancel scan"
                secondary
                small
                onPress={cancelScan}
                style={{ marginTop: 12, alignSelf: "flex-start" }}
              />
            </Card>
          )}
          {!!error && (
            <View style={{ gap: 8 }}>
              <Txt style={{ color: C.red, fontSize: 12 }}>{error}</Txt>
              {!scanning && (
                <Button label="Try scanning again" secondary onPress={scan} />
              )}
            </View>
          )}
          {draft && (
            <View style={{ gap: 12 }}>
              <Card style={{ padding: 16 }}>
                <Txt style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>
                  EXTRACTED DETAILS
                </Txt>
                <Txt style={{ fontSize: 20, fontWeight: "700" }}>
                  {draft.amount === undefined
                    ? "No total found"
                    : draft.amount.toFixed(2)}
                  {draft.currency ? ` ${draft.currency}` : ""}
                </Txt>
                {!!draft.note && (
                  <Txt style={{ marginTop: 4 }}>{draft.note}</Txt>
                )}
                <Txt style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>
                  {draft.date ? `Date: ${draft.date}` : "Date not found"}
                </Txt>
                <Txt style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>
                  Dates are filled only when their order is unambiguous. Choose
                  a category in the expense form.
                </Txt>
              </Card>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show original recognized text"
                onPress={() => setShowText((value) => !value)}
              >
                <Txt
                  style={{ color: C.purple, fontSize: 12, fontWeight: "600" }}
                >
                  {showText
                    ? "Hide original recognized text"
                    : "Show original recognized text"}
                </Txt>
              </Pressable>
              {showText && (
                <Card style={{ backgroundColor: C.bg, padding: 13 }}>
                  <Txt selectable style={{ fontSize: 11, color: C.muted }}>
                    {draft.text || "No text was recognized."}
                  </Txt>
                </Card>
              )}
              <Button
                label="Use details"
                icon="arrow-forward-outline"
                onPress={useDetails}
              />
              <Button
                label="Scan a different receipt"
                secondary
                onPress={() => resetReceipt()}
              />
            </View>
          )}
        </View>
      )}
    </Dialog>
  );
}
