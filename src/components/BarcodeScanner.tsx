"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/* ---------------------------------------------------------------------
   Camera barcode scanner using the browser's native BarcodeDetector.
   No library — Chrome/Edge ship it. Callers must render this only while
   scanning is wanted; the camera is released on unmount, on success and
   on error, so the capture light never lingers.
   --------------------------------------------------------------------- */

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

export function BarcodeScanner({
  onDetect,
  onClose,
}: {
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Hold the callback in a ref rather than depending on it.
     The parent re-renders once a second (the session countdown), which gives
     `onDetect` a new identity each time. If the effect below depended on it,
     the camera would be torn down and re-acquired every second — the video
     visibly flickers and detection never gets a stable frame. */
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    (async () => {
      if (typeof window === "undefined" || !window.BarcodeDetector) {
        setError(
          "This browser can't scan barcodes — type the number instead.",
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new window.BarcodeDetector({ formats: FORMATS });
        timer = setInterval(async () => {
          const video = videoRef.current;
          // Skip frames before the camera has produced any — detect() throws
          // on a zero-sized source and would just spam the console.
          if (!video || cancelled || !video.videoWidth) return;
          try {
            const hits = await detector.detect(video);
            const code = hits[0]?.rawValue?.trim();
            if (code) {
              stop();
              onDetectRef.current(code);
            }
          } catch {
            /* transient decode failure — keep trying */
          }
        }, 350);
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(
          name === "NotAllowedError"
            ? "Camera permission denied — type the number instead."
            : "Couldn't open the camera — type the number instead.",
        );
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // Deliberately empty: acquire the camera once on mount and release it on
    // unmount. See the ref above for why `onDetect` must not appear here.
  }, []);

  return (
    <div className="mt-3 border border-gray-300">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
          Point at the barcode
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-900"
          aria-label="Close scanner"
        >
          <X size={14} />
        </button>
      </div>
      {error ? (
        <p className="px-3 py-4 text-xs text-gray-400">{error}</p>
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          className="block max-h-64 w-full bg-gray-50 object-cover"
        />
      )}
    </div>
  );
}
