// Top of every screen: optional back link, title, a one-line summary or help
// text, and actions on the right.
import type { ReactNode } from "react";
import { Button } from "./Button";
import { BackIcon } from "./icons";

export function PageHeader({ title, back, summary, actions }: {
  title: string;
  back?: { to: string; label: string };
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-2">
      {back && <Button variant="ghost" to={back.to} aria-label={back.label} icon={<BackIcon />} className="-ml-3 px-2" />}
      <div className="min-w-0 flex-1 py-1.5">
        <h1 className="text-xl font-semibold">{title}</h1>
        {summary && <p className="text-sm text-muted">{summary}</p>}
      </div>
      {actions}
    </header>
  );
}
