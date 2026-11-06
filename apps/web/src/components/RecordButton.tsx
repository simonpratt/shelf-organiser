// The Dictate screen's microphone button (T6, ADR 0003): tap to start and tap
// again to stop, or hold it while talking and let go. A toggle named "Speak",
// pressed while listening, with what is happening written beside it.
import { useEffect, useState, type PointerEvent } from "react";
import { cx } from "../cx";
import { elapsedLabel } from "../speech/voice";
import { MicIcon } from "./icons";
import { Spinner } from "./Spinner";

type Props = {
  status: "idle" | "asking" | "listening" | "writing";
  /** When listening began, for the clock. */
  startedAt?: number;
  onPress: (now: number) => void;
  onRelease: (now: number) => void;
  disabled?: boolean;
};

const captions = {
  idle: "Tap and say what's here, or hold while you talk",
  asking: "Allow the microphone when your browser asks",
  listening: "Listening. Tap when you're done",
  writing: "Writing it down…",
};

export function RecordButton({ status, startedAt, onPress, onRelease, disabled }: Props) {
  const listening = status === "listening";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [listening]);
  const release = (e: PointerEvent) => e.isPrimary && onRelease(Date.now());
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <button type="button" aria-label="Speak" aria-pressed={listening}
        disabled={disabled || status === "asking" || status === "writing"}
        onPointerDown={(e) => e.isPrimary && e.button === 0 && onPress(Date.now())}
        onPointerUp={release} onPointerCancel={release}
        // A keyboard press arrives as a click with no pointer events.
        onClick={(e) => e.detail === 0 && onPress(Date.now())}
        onContextMenu={(e) => e.preventDefault()}
        className={cx(
          "flex size-24 touch-none select-none items-center justify-center rounded-full transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-50",
          listening ? "bg-error text-bg ring-8 ring-error-tint" : "bg-accent text-on-accent hover:bg-accent-hover",
        )}>
        {status === "writing" ? <Spinner /> : <span className="[&>svg]:size-10"><MicIcon /></span>}
      </button>
      <p aria-live="polite" className="text-center text-sm text-muted">
        {listening && startedAt !== undefined && <span className="mr-2 font-mono text-text">{elapsedLabel(now - startedAt)}</span>}
        {captions[status]}
      </p>
    </div>
  );
}
