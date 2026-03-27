import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"

export interface SavedViewResponse {
  id: string
  user_id: string
  name: string
  entity_type: string | null
  filter_json: Record<string, unknown> | null
}

interface SavedViewCreate {
  name: string
  entity_type?: string
  filter_json?: Record<string, unknown>
}

export function useSavedViews() {
  return useQuery<SavedViewResponse[]>({
    queryKey: ["saved-views"],
    queryFn: () => apiFetch<SavedViewResponse[]>("/saved-views"),
  })
}

export function useCreateSavedView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SavedViewCreate) =>
      apiFetch<SavedViewResponse>("/saved-views", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-views"] })
    },
  })
}

export function useDeleteSavedView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/saved-views/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-views"] })
    },
  })
}
