// Going back to the screen the user came from, so a search, a filter or a
// spot on the space map survives a save or delete. On the first screen of a
// visit (opened from a link or reloaded) there is nothing in the app to go
// back to, so it opens fallback in place instead of leaving the app.
import { useCallback } from "react";
import { useNavigate } from "react-router";

/** True when the history has an earlier entry from this app (react-router keeps its index). */
export function canGoBack(): boolean {
  return ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
}

export function useGoBack(): (fallback: string) => void {
  const navigate = useNavigate();
  return useCallback((fallback: string) => {
    if (canGoBack()) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate]);
}
