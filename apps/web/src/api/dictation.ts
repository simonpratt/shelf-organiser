// Dictation: whether it is set up, and reading drafts out of a transcript.
// Drafting saves nothing, so there is nothing to invalidate.
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "./client";

export function useDictation() {
  return useQuery({
    queryKey: ["dictation"],
    queryFn: async () => unwrap(await api.GET("/api/dictation")),
    // Only a server restart with a new API key changes it.
    staleTime: Infinity,
  });
}

export function useDraftItems() {
  return useMutation({
    mutationFn: async (transcript: string) =>
      unwrap(await api.POST("/api/dictation/drafts", { body: { transcript } })).drafts,
  });
}
