// The browser side of speaking: support checks, recording from the
// microphone with MediaRecorder, and decoding what was recorded into the
// 16 kHz mono samples Whisper takes. Kept thin; the decisions are in voice.ts.
import { voiceSupport } from "./voice";

export function browserVoiceSupport() {
  return voiceSupport({
    isSecureContext: window.isSecureContext,
    getUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
    mediaRecorder: typeof MediaRecorder !== "undefined",
    worker: typeof Worker !== "undefined",
    webAssembly: typeof WebAssembly !== "undefined",
  });
}

export type Recording = { stop(): Promise<Blob>; cancel(): void };

/** Asks for the microphone and starts recording; rejects with a NotAllowedError if refused. */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          release();
          resolve(new Blob(chunks, { type: recorder.mimeType }));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = release;
      if (recorder.state !== "inactive") recorder.stop();
      else release();
    },
  };
}

export const isPermissionDenied = (e: unknown) =>
  e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");

/** Decodes a recording (WebM/Opus, or MP4/AAC on Safari) into 16 kHz mono samples. */
export async function decodeForWhisper(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: 16_000 });
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    return audio.getChannelData(0).slice();
  } finally {
    void context.close();
  }
}
