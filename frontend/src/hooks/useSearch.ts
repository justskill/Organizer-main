import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"

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

interface SearchLocationBrief {
  id: string
  code: string
  name: string
  path_text: string | null
  tags: { id: string; name: string; slug: string }[]
}

interface SearchTagBrief {
  id: string
  name: string
  slug: string
}

export interface GlobalSearchResponse {
  items: SearchItemBrief[]
  containers: SearchItemBrief[]
  locations: SearchLocationBrief[]
  tags: SearchTagBrief[]
}

export type SearchResultItem =
  | { type: "item"; data: SearchItemBrief }
  | { type: "container"; data: SearchItemBrief }
  | { type: "location"; data: SearchLocationBrief }
  | { type: "tag"; data: SearchTagBrief }

/**
 * Fetches global search results using TanStack Query.
 * Only fires when the query is at least 2 characters.
 */
export function useSearch(query: string) {
  return useQuery<GlobalSearchResponse>({
    queryKey: ["search", query],
    queryFn: () =>
      apiFetch<GlobalSearchResponse>(
        `/search?q=${encodeURIComponent(query)}`
      ),
    enabled: query.length >= 2,
    staleTime: 30_000,
  })
}
