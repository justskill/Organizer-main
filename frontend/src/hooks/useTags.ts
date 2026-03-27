import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"

export interface TagResponse {
  id: string
  name: string
  slug: string
  color: string | null
}

export function useTags() {
  return useQuery<TagResponse[]>({
    queryKey: ["tags"],
    queryFn: () => apiFetch<TagResponse[]>("/tags"),
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; color?: string }) =>
      apiFetch<TagResponse>("/tags", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] })
    },
  })
}

export function useAddItemTag(itemId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) =>
      apiFetch<{ status: string }>(`/items/${itemId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag_id: tagId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item", itemId] })
      qc.invalidateQueries({ queryKey: ["items"] })
      qc.invalidateQueries({ queryKey: ["tags"] })
    },
  })
}

export function useRemoveItemTag(itemId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) =>
      apiFetch<void>(`/items/${itemId}/tags/${tagId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item", itemId] })
      qc.invalidateQueries({ queryKey: ["items"] })
      qc.invalidateQueries({ queryKey: ["tags"] })
    },
  })
}

export function useAddLocationTag(locationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) =>
      apiFetch<{ status: string }>(`/locations/${locationId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag_id: tagId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location", locationId] })
      qc.invalidateQueries({ queryKey: ["locations"] })
      qc.invalidateQueries({ queryKey: ["tags"] })
    },
  })
}

export function useRemoveLocationTag(locationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) =>
      apiFetch<void>(`/locations/${locationId}/tags/${tagId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location", locationId] })
      qc.invalidateQueries({ queryKey: ["locations"] })
      qc.invalidateQueries({ queryKey: ["tags"] })
    },
  })
}
