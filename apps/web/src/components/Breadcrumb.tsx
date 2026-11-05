// Where the user is in a drill-down (T3 space map): each level above links
// back up, the current one is plain text. Wraps rather than scrolls on a phone.
import { Fragment } from "react";
import { Link } from "react-router";

export function Breadcrumb({ trail }: { trail: { key: string; label: string; to: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 text-sm">
        {trail.map((c, i) => (
          <Fragment key={c.key}>
            {i > 0 && <li aria-hidden="true" className="text-muted">›</li>}
            <li>
              {i === trail.length - 1 ? (
                <span aria-current="page" className="inline-flex min-h-touch items-center px-1 font-medium">{c.label}</span>
              ) : (
                <Link to={c.to} className="inline-flex min-h-touch items-center px-1 text-accent hover:underline">{c.label}</Link>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
