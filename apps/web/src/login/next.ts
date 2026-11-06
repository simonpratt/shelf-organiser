// Where the login page sends the browser afterwards: back to the screen that
// needed a login, but only ever to a path in this app, never another site.

export const LOGIN_PATH = "/login";

/** The login page's URL for a browser that was on path (pathname + search). */
export function loginUrl(path: string): string {
  return path === "/" || path.startsWith(LOGIN_PATH) ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(path)}`;
}

/** The ?next= path if it is one of this app's own, else the item list. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  // eslint-disable-next-line no-control-regex -- a control character could smuggle in another URL
  if (/[\u0000-\u001f\\]/.test(next) || next.startsWith(LOGIN_PATH)) return "/";
  return next;
}
