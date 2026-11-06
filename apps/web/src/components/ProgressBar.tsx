// A labelled bar for something that takes a while, such as the first download
// of the speech model (T6).
export function ProgressBar({ label, value, detail }: { label: string; value: number; detail?: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-3 text-sm">
        <span>{label}</span>
        {detail && <span className="font-mono text-muted">{detail}</span>}
      </div>
      <div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
        aria-valuetext={detail} className="h-2 overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
