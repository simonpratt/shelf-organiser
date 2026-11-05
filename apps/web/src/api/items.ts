// Item queries and mutations. Saving an item can create tags, so writes also
// refresh the tag list.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, type ItemInput } from "./client";

export const itemKeys = { all: ["items"] as const };

export function useItems() {
  return useQuery({ queryKey: itemKeys.all, queryFn: async () => unwrap(await api.GET("/api/items")) });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: itemKeys.all }), qc.invalidateQueries({ queryKey: ["tags"] })]);
}

export function useCreateItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: ItemInput) => unwrap(await api.POST("/api/items", { body })),
    onSuccess: invalidate,
  });
}

/**
 * Creates an item outside any mutation observer, so it still completes and
 * reports back when the screen that started it has gone (Undo in a toast).
 */
export function useRestoreItem() {
  const invalidate = useInvalidate();
  return async (body: ItemInput) => {
    const item = unwrap(await api.POST("/api/items", { body }));
    await invalidate();
    return item;
  };
}

export function useUpdateItem(id: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: ItemInput) => unwrap(await api.PUT("/api/items/{id}", { params: { path: { id } }, body })),
    onSuccess: invalidate,
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: number) => {
      unwrap(await api.DELETE("/api/items/{id}", { params: { path: { id } } }));
    },
    onSuccess: invalidate,
  });
}
