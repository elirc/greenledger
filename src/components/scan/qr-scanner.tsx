"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, Flashlight, FlashlightOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Minimal typing for the Shape Detection API (not in TS's DOM lib). */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: {
  formats?: string[];
}) => BarcodeDetectorLike;

type CameraState =
  | { kind: "starting" }
  | { kind: "running" }
  | { kind: "unsupported" }
  | { kind: "denied" }
  | { kind: "error"; message: string };

type TorchTrack = MediaStreamTrack;
/** `torch` is a real capability on Chrome/Android but missing from TS's DOM lib. */
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

const DUPLICATE_WINDOW_MS = 2500;

/**
 * Live QR scanner. Uses the native BarcodeDetector when the browser has it,
 * otherwise falls back to @zxing/browser (loaded on demand). We own the
 * camera stream in both paths so the torch toggle and the cleanup (camera
 * off on unmount) behave the same.
 */
export function QrScanner({
  onDecode,
  paused = false,
}: {
  onDecode: (text: string) => void;
  /** Keep the camera on but ignore decodes (e.g. while a sheet is open). */
  paused?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>({ kind: "starting" });
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const trackRef = useRef<TorchTrack | null>(null);

  // Latest callback/paused without restarting the camera.
  const onDecodeRef = useRef(onDecode);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onDecodeRef.current = onDecode;
    pausedRef.current = paused;
  }, [onDecode, paused]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let stopDecoder: (() => void) | null = null;
    let last = { text: "", at: 0 };

    function emit(text: string) {
      if (pausedRef.current || !text) return;
      const now = Date.now();
      if (text === last.text && now - last.at < DUPLICATE_WINDOW_MS) return;
      last = { text, at: now };
      onDecodeRef.current(text);
    }

    async function start() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setState({ kind: "unsupported" });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setState({ kind: "denied" });
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setState({ kind: "unsupported" });
        } else {
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Camera failed to start.",
          });
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      try {
        await video.play();
      } catch {
        // Autoplay can reject while the element is re-rendering; decoding still works.
      }

      const track = stream.getVideoTracks()[0] as TorchTrack | undefined;
      trackRef.current = track ?? null;
      const caps = track?.getCapabilities?.() as TorchCapabilities | undefined;
      setTorchSupported(Boolean(caps && caps.torch));

      const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      if (Native) {
        const detector = new Native({ formats: ["qr_code"] });
        let timer: number | undefined;
        const tick = async () => {
          if (cancelled) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              if (codes[0]) emit(codes[0].rawValue);
            }
          } catch {
            // Transient detect errors (frame not ready) — keep scanning.
          }
          if (!cancelled) timer = window.setTimeout(tick, 250);
        };
        void tick();
        stopDecoder = () => window.clearTimeout(timer);
      } else {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromStream(
          stream,
          video,
          (result) => {
            if (result) emit(result.getText());
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        stopDecoder = () => controls.stop();
      }
      setState({ kind: "running" });
    }

    void start();

    return () => {
      cancelled = true;
      stopDecoder?.();
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, []);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  if (state.kind === "denied" || state.kind === "unsupported" || state.kind === "error") {
    return (
      <div className="bg-muted/40 flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center">
        <CameraOff className="text-muted-foreground size-8" />
        <p className="font-medium">
          {state.kind === "denied"
            ? "Camera permission is blocked"
            : state.kind === "unsupported"
              ? "No camera available"
              : "Camera could not start"}
        </p>
        <p className="text-muted-foreground text-sm">
          {state.kind === "denied"
            ? "Allow camera access for this site in your browser settings, or type the code below."
            : state.kind === "unsupported"
              ? "This device or browser cannot scan. Type the code below instead."
              : state.message}
        </p>
      </div>
    );
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        className="size-full object-cover"
        muted
        playsInline
        aria-label="Camera preview"
      />
      <div
        aria-hidden
        className="border-primary pointer-events-none absolute inset-[18%] rounded-lg border-4"
      />
      {state.kind === "starting" ? (
        <div className="text-primary-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
          <LoaderCircle className="size-5 animate-spin" /> Starting camera…
        </div>
      ) : null}
      {torchSupported ? (
        <Button
          type="button"
          variant="secondary"
          className="absolute right-3 bottom-3 h-11 px-4"
          onClick={toggleTorch}
          aria-pressed={torchOn}
        >
          {torchOn ? (
            <FlashlightOff className="size-5" />
          ) : (
            <Flashlight className="size-5" />
          )}
          {torchOn ? "Torch off" : "Torch on"}
        </Button>
      ) : null}
    </div>
  );
}
