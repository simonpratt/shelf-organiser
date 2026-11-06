// Shared button: every tappable action in the app. Renders a router Link when
// given `to`. Spec: T1 — fast, phone-sized touch targets.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "../cx";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: Variant;
  icon?: ReactNode;
  /** Shows a spinner and disables the button while an action is in flight. */
  busy?: boolean;
  /** Stretches to the container's width. */
  block?: boolean;
  /** lg: the one big call to action on a screen, such as Dictate items. */
  size?: "md" | "lg";
  to?: string;
  /** History state for the screen `to` opens, such as tags to start with. */
  state?: unknown;
  children?: ReactNode;
};

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-surface-raised text-text border border-border hover:border-accent",
  ghost: "text-accent hover:bg-accent-tint",
  danger: "text-error border border-error hover:bg-error-tint",
};

export function Button({ variant = "secondary", icon, busy, block, size = "md", to, state, className, children, disabled, ...rest }: Props) {
  const classes = cx(
    "inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-md px-4 font-medium",
    size === "lg" ? "min-h-14 text-lg" : "text-base",
    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    block && "w-full",
    className,
  );
  const content = (
    <>
      {busy ? <Spinner /> : icon}
      {children}
    </>
  );
  if (to !== undefined) {
    return (
      <Link to={to} state={state} className={classes} aria-label={rest["aria-label"]}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {content}
    </button>
  );
}
