import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"
import type { ItemListResponse } from "@/types"

interface UseItemsOptions {
  page?: number
  pageSize?: number
  archived?: boolean
}

export function useItems(options: UseItemsOptions = {}) {
  const { page = 1, pageSize = 200, archived = false } = options

  return useQuery<ItemListResponse>({
    queryKey: ["items", { page, pageSize, archived }],
    queryFn: () =>
      apiFetch<ItemListResponse>(
        `/items?page=${page}&page_size=${pageSize}&archived=${archived}`
      ),
  })
}
