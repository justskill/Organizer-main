import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"

export interface AuditEvent {
  id: string
  actor_user_id: string | null
  entity_type: string
  entity_id: string
  event_type: string
  event_data_json: Record<string, unknown> | null
  created_at: string
}

export function useItemHistory(id: string | undefined) {
  return useQuery<AuditEvent[]>({
    queryKey: ["item-history", id],
    queryFn: () => apiFetch<AuditEvent[]>(`/items/${id}/history`),
    enabled: !!id,
  })
}
