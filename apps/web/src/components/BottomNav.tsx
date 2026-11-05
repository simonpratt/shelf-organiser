// Bottom tab bar on the main screens, in thumb reach on a phone.
import { NavLink } from "react-router";
import { cx } from "../cx";
import { BoxIcon, TagIcon } from "./icons";

const tabs = [
  { to: "/", label: "Items", icon: <BoxIcon />, end: true },
  { to: "/tags", label: "Tags", icon: <TagIcon />, end: false },
];

export function BottomNav() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-page">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink to={t.to} end={t.end}
              className={({ isActive }) => cx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs",
                isActive ? "text-accent" : "text-muted hover:text-text")}>
              {t.icon}
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
