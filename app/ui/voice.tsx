"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";

// Gemini voice input: record in the browser, send once to the KinCard server,
// Gemini transcribes, the text goes into the box for the person to review.
// Works on iPhone and Android browsers over https (the tunnel link) or localhost.

const MAX_MS = 120_000;
type VoiceState = "idle" | "recording" | "transcribing";

function pickType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported)
    return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(
    (type) => MediaRecorder.isTypeSupported(type),
  );
}
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.readAsDataURL(blob);
  });
}

export function useGeminiRecorder(
  endpoint: string,
  onText: (text: string) => void,
) {
  const [state, setState] = useState<VoiceState>("idle");
  const [message, setMessage] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const textHandler = useRef(onText);
  const mounted = useRef(true);
  useEffect(() => {
    textHandler.current = onText;
  });

  function release() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      release();
    };
  }, []);

  async function send(mimeType: string) {
    release();
    if (!mounted.current) return;
    setState("transcribing");
    setMessage("Gemini is transcribing…");
    try {
      const blob = new Blob(chunks.current, { type: mimeType });
      if (!blob.size) throw new Error("Nothing was recorded. Please try again.");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audio: { mimeType, data: await toBase64(blob) } }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Gemini could not transcribe that. Please type instead.");
      if (!mounted.current) return;
      if (data.text?.trim()) {
        textHandler.current(data.text.trim());
        setMessage("Transcribed by Gemini. Check and edit the text before sharing.");
      } else setMessage("No speech was heard. Please try again or type instead.");
    } catch (error) {
      if (mounted.current)
        setMessage(error instanceof Error ? error.message : "Please type instead.");
    } finally {
      if (mounted.current) setState("idle");
    }
  }

  async function start() {
    if (state !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage(
        "This browser can't record here. Open KinCard from the https link (or localhost), or type instead.",
      );
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = pickType();
      const rec = new MediaRecorder(
        stream.current,
        type ? { mimeType: type, audioBitsPerSecond: 64_000 } : undefined,
      );
      chunks.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      rec.onstop = () => void send(rec.mimeType || type || "audio/webm");
      recorder.current = rec;
      rec.start();
      setState("recording");
      setMessage("Listening… tap Stop when you're done (2 minutes max).");
      timer.current = window.setTimeout(() => stop(), MAX_MS);
    } catch {
      release();
      setState("idle");
      setMessage("Microphone access was blocked. Allow the microphone or type instead.");
    }
  }
  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  return { state, message, start, stop };
}

/** A self-contained "Speak instead" button for a text box. */
export function VoiceInput({
  endpoint,
  onText,
  disabled,
  label = "Speak instead",
}: {
  endpoint: string;
  onText: (text: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const voice = useGeminiRecorder(endpoint, onText);
  return (
    <div className="voice-input">
      <button
        type="button"
        className={
          voice.state === "recording"
            ? "button voice-button recording"
            : "button voice-button secondary"
        }
        disabled={disabled || voice.state === "transcribing"}
        aria-pressed={voice.state === "recording"}
        onClick={() => (voice.state === "recording" ? voice.stop() : void voice.start())}
      >
        {voice.state === "recording" ? (
          <Square size={16} />
        ) : voice.state === "transcribing" ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Mic size={16} />
        )}
        {voice.state === "recording"
          ? "Stop recording"
          : voice.state === "transcribing"
            ? "Transcribing…"
            : label}
      </button>
      {voice.message && (
        <p className="hint" role="status">
          {voice.message}
        </p>
      )}
    </div>
  );
}
