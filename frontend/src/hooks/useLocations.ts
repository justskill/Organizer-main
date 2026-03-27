import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"
import type {
  LocationResponse,
  LocationListResponse,
  LocationContents,
  LocationTreeNode,
} from "@/types"

export function useLocations(options: { page?: number; pageSize?: number; rootOnly?: boolean } = {}) {
  const { page = 1, pageSize = 200, rootOnly = false } = options
  return useQuery<LocationListResponse>({
    queryKey: ["locations", { page, pageSize, rootOnly }],
    queryFn: () =>
      apiFetch<LocationListResponse>(
        `/locations?page=${page}&page_size=${pageSize}&root_only=${rootOnly}`
      ),
  })
}

export function useLocation(id: string | undefined) {
  return useQuery<LocationResponse>({
    queryKey: ["location", id],
    queryFn: () => apiFetch<LocationResponse>(`/locations/${id}`),
    enabled: !!id,
  })
}

export function useLocationContents(id: string | undefined) {
  return useQuery<LocationContents>({
    queryKey: ["location-contents", id],
    queryFn: () => apiFetch<LocationContents>(`/locations/${id}/contents`),
    enabled: !!id,
  })
}

export function useLocationTree(id: string | undefined) {
  return useQuery<LocationTreeNode>({
    queryKey: ["location-tree", id],
    queryFn: () => apiFetch<LocationTreeNode>(`/locations/${id}/tree`),
    enabled: !!id,
  })
}

export function useCreateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; parent_location_id?: string; location_type?: string; notes?: string }) =>
      apiFetch<LocationResponse>("/locations", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] })
      qc.invalidateQueries({ queryKey: ["location-contents"] })
    },
  })
}

export function useUpdateLocation(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<LocationResponse>(`/locations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location", id] })
      qc.invalidateQueries({ queryKey: ["locations"] })
      qc.invalidateQueries({ queryKey: ["location-contents"] })
    },
  })
}
