import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"

export interface ItemRelationship {
  id: string
  source_item_id: string
  target_item_id: string
  relationship_type: string
  note: string | null
  created_at: string
}

export function useItemRelationships(id: string | undefined) {
  return useQuery<ItemRelationship[]>({
    queryKey: ["item-relationships", id],
    queryFn: () => apiFetch<ItemRelationship[]>(`/items/${id}/relationships`),
    enabled: !!id,
  })
}
