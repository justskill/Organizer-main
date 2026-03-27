import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"

export interface ScanResult {
  entity_type: string
  entity_id: string
  name: string
  code: string
  archived: boolean
}

/**
 * Resolves a scanned short code to its entity via the /scan/{code} endpoint.
 * Only fires when a non-empty code is provided.
 */
export function useScan(code: string | null) {
  return useQuery<ScanResult>({
    queryKey: ["scan", code],
    queryFn: () => apiFetch<ScanResult>(`/scan/${encodeURIComponent(code!)}`),
    enabled: !!code,
    retry: false,
    staleTime: 60_000,
  })
}
