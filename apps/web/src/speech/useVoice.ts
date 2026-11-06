// Wires voice.ts's reducer to the microphone and the transcriber: starts
// loading the model when the Dictate screen opens, and hands each piece of
// spoken text to onText.
import { useEffect, useRef, useState } from "react";
import { decodeForWhisper, isPermissionDenied, startRecording, type Recording } from "./microphone";
import { transcriber } from "./transcriber";
import { MAX_MS, initialVoice, step, type Event, type Voice } from "./voice";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useVoice(onText: (text: string) => void, enabled: boolean) {
  const [voice, setVoice] = useState<Voice>(initialVoice);
  const current = useRef(voice);
  const recording = useRef<Recording | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textHandler = useRef(onText);
  useEffect(() => {
    textHandler.current = onText;
  }, [onText]);

  // One dispatcher for the screen's life; the effects it starts dispatch again.
  const [dispatch] = useState(() => function dispatch(event: Event) {
    const { state, effect } = step(current.current, event);
    current.current = state;
    setVoice(state);
    if (event.type === "written" && event.text.trim()) textHandler.current(event.text);
    const load = () =>
      transcriber().load((loaded, total) => dispatch({ type: "progress", loaded, total }));
    if (effect === "loadModel") {
      load().then(() => dispatch({ type: "modelReady" }), (e) => dispatch({ type: "modelFailed", message: message(e) }));
    } else if (effect === "askMic") {
      startRecording().then(
        (rec) => {
          if (current.current.mic.status !== "asking") return rec.cancel();
          recording.current = rec;
          timer.current = setTimeout(() => dispatch({ type: "timeUp" }), MAX_MS);
          dispatch({ type: "granted", now: Date.now() });
        },
        (e) => dispatch(isPermissionDenied(e) ? { type: "denied" } : { type: "micFailed", message: message(e) }),
      );
    } else if (effect === "stopMic") {
      clearTimeout(timer.current);
      const rec = recording.current;
      recording.current = null;
      if (!rec) return;
      (async () => {
        const audio = await decodeForWhisper(await rec.stop());
        await load();
        return transcriber().transcribe(audio);
      })().then(
        (text) => dispatch({ type: "written", text }),
        (e) => dispatch({ type: "writeFailed", message: message(e) }),
      );
    }
  });

  useEffect(() => {
    if (!enabled) return;
    dispatch({ type: "load" });
    return () => {
      clearTimeout(timer.current);
      recording.current?.cancel();
      recording.current = null;
    };
  }, [enabled, dispatch]);

  return { voice, dispatch };
}
