// Small busy indicator for buttons and inline loading.
export function Spinner({ label }: { label?: string }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label && <span>{label}</span>}
    </span>
  );
}
