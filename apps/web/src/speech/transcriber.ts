// Turns recorded audio into text with Whisper in a Web Worker (ADR 0003).
// The e2e suite swaps in a fake by setting window.shelfFakeTranscriber before
// the app loads, so browser tests don't load the real model.

export type ToWorker = { type: "load" } | { type: "transcribe"; id: number; audio: Float32Array };
export type FromWorker =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "failed"; message: string }
  | { type: "text"; id: number; text: string }
  | { type: "textFailed"; id: number; message: string };

export interface Transcriber {
  /** Loads the model, reporting bytes fetched so far; resolves when it is ready. */
  load(onProgress: (loaded: number, total: number) => void): Promise<void>;
  /** Text spoken in 16 kHz mono samples. */
  transcribe(audio: Float32Array): Promise<string>;
}

declare global {
  interface Window {
    shelfFakeTranscriber?: Transcriber;
  }
}

let shared: Transcriber | null = null;

/** One transcriber for the tab, so leaving Dictate and coming back doesn't load the model again. */
export function transcriber(): Transcriber {
  shared ??= window.shelfFakeTranscriber ?? workerTranscriber();
  return shared;
}

function workerTranscriber(): Transcriber {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const waiting = new Map<number, { resolve: (text: string) => void; reject: (e: Error) => void }>();
  let progress: (loaded: number, total: number) => void = () => {};
  let loading: { resolve: () => void; reject: (e: Error) => void } | null = null;
  let loaded: Promise<void> | null = null;
  let next = 0;
  worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
    if (data.type === "progress") progress(data.loaded, data.total);
    else if (data.type === "ready") loading?.resolve();
    else if (data.type === "failed") {
      loaded = null; // let a retry load again
      loading?.reject(new Error(data.message));
    } else {
      const call = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.type === "text") call?.resolve(data.text);
      else call?.reject(new Error(data.message));
    }
  };
  return {
    load(onProgress) {
      progress = onProgress;
      loaded ??= new Promise<void>((resolve, reject) => {
        loading = { resolve, reject };
        worker.postMessage({ type: "load" } satisfies ToWorker);
      });
      return loaded;
    },
    transcribe(audio) {
      const id = next++;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ type: "transcribe", id, audio } satisfies ToWorker, [audio.buffer]);
      });
    },
  };
}
