// Inline SVG icons, 24px grid, drawn with currentColor. Decorative unless a
// title is passed.
import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const MinusIcon = () => <Icon><path d="M5 12h14" /></Icon>;
export const CloseIcon = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const BackIcon = () => <Icon><path d="M15 18l-6-6 6-6" /></Icon>;
export const SearchIcon = () => <Icon><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>;
export const BoxIcon = () => <Icon><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></Icon>;
export const TagIcon = () => <Icon><path d="M3 12V3h9l9 9-9 9-9-9z" /><circle cx="7.5" cy="7.5" r="1.5" /></Icon>;
/** Untagged: a dashed outline, matching its dashed block on the space map. */
export const UntaggedIcon = () => <Icon strokeDasharray="3 3"><rect x="4" y="4" width="16" height="16" rx="2" /></Icon>;
export const ChevronIcon = () => <Icon><path d="M9 6l6 6-6 6" /></Icon>;
export const MicIcon = () => <Icon><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Icon>;
export const MapIcon = () => <Icon><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18M12 12h9M16.5 12v9" /></Icon>;
/** Claude: something it proposes or does for you. */
export const SparkleIcon = () => <Icon><path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" /><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></Icon>;
