// Top of every screen: optional back button, title, a one-line summary or
// help text, and actions on the right. Back returns to the previous screen,
// or opens back.to when there is none.
import type { ReactNode } from "react";
import { useGoBack } from "../back";
import { Button } from "./Button";
import { BackIcon } from "./icons";

export function PageHeader({ title, back, summary, actions }: {
  title: string;
  back?: { to: string; label: string };
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  const goBack = useGoBack();
  return (
    <header className="flex items-start gap-2">
      {back && <Button variant="ghost" onClick={() => goBack(back.to)} aria-label={back.label} icon={<BackIcon />} className="-ml-3 px-2" />}
      <div className="min-w-0 flex-1 py-1.5">
        <h1 className="text-xl font-semibold">{title}</h1>
        {summary && <p className="text-sm text-muted">{summary}</p>}
      </div>
      {actions}
    </header>
  );
}
