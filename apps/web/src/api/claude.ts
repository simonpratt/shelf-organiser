// Claude features: whether they are set up, reading a dictation into drafts,
// and proposed tags for one item or for Organise. None of these save
// anything, so there is nothing to invalidate; applying proposals goes
// through useAddItemTags.
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, unwrap, type TagPath } from "./client";

export function useClaude() {
  return useQuery({
    queryKey: ["claude"],
    queryFn: async () => unwrap(await api.GET("/api/claude")),
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

/** Proposes tags for one item, saved or not, from its name, note and tags so far. */
export async function proposeTags(item: { name: string; note: string; tags: TagPath[] }) {
  return unwrap(await api.POST("/api/tag-proposals", { body: item })).tags;
}

export function useOrganise() {
  return useMutation({ mutationFn: async () => unwrap(await api.POST("/api/organise")) });
}
