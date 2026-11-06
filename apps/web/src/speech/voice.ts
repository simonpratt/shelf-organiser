// Speaking a dictation (T6, ADR 0003): whether this browser can, and the
// state of the microphone button and the speech model, as one reducer. The
// hook (useVoice) does what each transition's effect says; this module only
// decides.

/** Why the microphone can't be offered, so the screen can say so and offer typing. */
export type Unavailable = "insecure" | "unsupported";

export function voiceSupport(env: {
  isSecureContext: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
  worker: boolean;
  webAssembly: boolean;
}): Unavailable | null {
  // Browsers hide navigator.mediaDevices over plain HTTP, so check this first.
  if (!env.isSecureContext) return "insecure";
  if (!env.getUserMedia || !env.mediaRecorder || !env.worker || !env.webAssembly) return "unsupported";
  return null;
}

/** A press held at least this long stops when released (hold to talk); a shorter one is a tap. */
export const HOLD_MS = 600;
/** Speaking stops by itself after this long. */
export const MAX_MS = 120_000;

export type Model =
  | { status: "loading"; loaded: number; total: number }
  | { status: "ready" }
  | { status: "failed"; message: string };

export type Mic =
  | { status: "idle"; notice?: "denied" | "nothing" | "timeUp"; error?: string }
  /** Waiting for the browser's permission prompt. */
  | { status: "asking"; held: boolean; pressedAt: number }
  | { status: "listening"; startedAt: number; held: boolean; pressedAt: number }
  /** Turning what was said into text, once the model is ready. */
  | { status: "writing"; notice?: "timeUp" };

export type Voice = { mic: Mic; model: Model };

export type Event =
  | { type: "press"; now: number }
  | { type: "release"; now: number }
  | { type: "granted"; now: number }
  | { type: "denied" }
  | { type: "micFailed"; message: string }
  | { type: "timeUp" }
  | { type: "written"; text: string }
  | { type: "writeFailed"; message: string }
  | { type: "progress"; loaded: number; total: number }
  | { type: "modelReady" }
  | { type: "modelFailed"; message: string }
  /** On opening Dictate, and on Retry after the model failed to load. */
  | { type: "load" };

/** What the hook must do after a transition. */
export type Effect = "askMic" | "stopMic" | "loadModel" | null;

export const initialVoice: Voice = { mic: { status: "idle" }, model: { status: "loading", loaded: 0, total: 0 } };

export function step(state: Voice, event: Event): { state: Voice; effect: Effect } {
  const { mic, model } = state;
  const to = (next: Partial<Voice>, effect: Effect = null) => ({ state: { ...state, ...next }, effect });
  const same = { state, effect: null };
  switch (event.type) {
    case "press":
      if (mic.status === "idle") return to({ mic: { status: "asking", held: true, pressedAt: event.now } }, "askMic");
      if (mic.status === "listening") return to({ mic: { status: "writing" } }, "stopMic");
      return same;
    case "release":
      if (mic.status === "asking") return to({ mic: { ...mic, held: false } });
      if (mic.status === "listening" && mic.held) {
        if (event.now - mic.pressedAt >= HOLD_MS) return to({ mic: { status: "writing" } }, "stopMic");
        return to({ mic: { ...mic, held: false } });
      }
      return same;
    case "granted":
      if (mic.status !== "asking") return same;
      return to({ mic: { status: "listening", startedAt: event.now, held: mic.held, pressedAt: mic.pressedAt } });
    case "denied":
      return mic.status === "asking" ? to({ mic: { status: "idle", notice: "denied" } }) : same;
    case "micFailed":
      return to({ mic: { status: "idle", error: event.message } });
    case "timeUp":
      return mic.status === "listening" ? to({ mic: { status: "writing", notice: "timeUp" } }, "stopMic") : same;
    case "written":
      if (mic.status !== "writing") return same;
      return to({ mic: event.text.trim() ? { status: "idle", notice: mic.notice } : { status: "idle", notice: "nothing" } });
    case "writeFailed":
      return mic.status === "writing" ? to({ mic: { status: "idle", error: event.message } }) : same;
    case "progress":
      return model.status === "loading" ? to({ model: { status: "loading", loaded: event.loaded, total: event.total } }) : same;
    case "modelReady":
      return to({ model: { status: "ready" } });
    case "modelFailed":
      // Anything waiting on the model fails with it; the text so far stays.
      return to({
        model: { status: "failed", message: event.message },
        mic: mic.status === "writing" ? { status: "idle", error: event.message } : mic,
      });
    case "load":
      // Loading again is cheap: the transcriber keeps one load for the tab.
      return model.status === "ready" ? same : to({ model: model.status === "failed" ? initialVoice.model : model }, "loadModel");
  }
}

/** Adds newly spoken text after what's already in the box, so speaking again adds to the list. */
export function appendSpoken(existing: string, spoken: string): string {
  const text = spoken.trim();
  if (!text) return existing;
  const before = existing.trimEnd();
  return before ? `${before} ${text}` : text;
}

/** "23 of 77 MB", for the first-time model download. */
export function downloadLabel(loaded: number, total: number): string {
  const mb = (bytes: number) => Math.round(bytes / 1_000_000);
  return total > 0 ? `${mb(loaded)} of ${mb(total)} MB` : "Starting…";
}

/** "0:07", how long the microphone has been listening. */
export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
