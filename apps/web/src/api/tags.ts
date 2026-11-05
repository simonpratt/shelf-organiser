// Tag queries and mutations. Renaming, moving or deleting a tag changes the
// tag paths shown on items, so writes also refresh the item list.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { itemKeys } from "./items";

export const tagKeys = { all: ["tags"] as const };

export function useTags() {
  return useQuery({ queryKey: tagKeys.all, queryFn: async () => unwrap(await api.GET("/api/tags")) });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: tagKeys.all }), qc.invalidateQueries({ queryKey: itemKeys.all })]);
}

export function useEnsureTag() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (path: string[]) => unwrap(await api.POST("/api/tags", { body: { path } })),
    onSuccess: invalidate,
  });
}

export function useUpdateTag() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, name, parentId }: { id: number; name: string; parentId: number | null }) =>
      unwrap(await api.PUT("/api/tags/{id}", { params: { path: { id } }, body: { name, parentId } })),
    onSuccess: invalidate,
  });
}

export function useDeleteTag() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: number) => {
      unwrap(await api.DELETE("/api/tags/{id}", { params: { path: { id } } }));
    },
    onSuccess: invalidate,
  });
}
