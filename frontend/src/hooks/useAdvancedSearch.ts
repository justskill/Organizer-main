import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"

export interface AdvancedSearchFilters {
  query?: string
  category_id?: string
  item_type?: string
  location_id?: string
  tag_ids?: string[]
  min_quantity?: number
  max_quantity?: number
  has_photo?: boolean
  maintenance_due?: boolean
  limit?: number
  offset?: number
}

interface SearchItemBrief {
  id: string
  code: string
  name: string
  item_type: string
  is_container: boolean
  brand: string | null
  model_number: string | null
  tags: { id: string; name: string; slug: string }[]
}

export interface AdvancedSearchResponse {
  items: SearchItemBrief[]
  total: number
}

export function useAdvancedSearch(filters: AdvancedSearchFilters, enabled = true) {
  return useQuery<AdvancedSearchResponse>({
    queryKey: ["advanced-search", filters],
    queryFn: () =>
      apiFetch<AdvancedSearchResponse>("/search/advanced", {
        method: "POST",
        body: JSON.stringify(filters),
      }),
    enabled,
    staleTime: 15_000,
  })
}
