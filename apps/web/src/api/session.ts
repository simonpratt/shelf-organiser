// The login: whether one is needed and this browser has it, logging in and
// logging out. Logging in or out changes what every other query may see, so
// both start the cache afresh.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api, unwrap } from "./client";

export const sessionKey = ["session"] as const;

export function useSession() {
  return useQuery({ queryKey: sessionKey, queryFn: async () => unwrap(await api.GET("/api/session")) });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { username: string; password: string }) => {
      unwrap(await api.POST("/api/login", { body }));
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Logs out and opens the login page, forgetting everything loaded. */
export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      unwrap(await api.POST("/api/logout"));
    },
    onSuccess: () => {
      navigate("/login", { replace: true });
      qc.clear();
    },
  });
}
