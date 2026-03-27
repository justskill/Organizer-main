import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"

export interface CategoryResponse {
  id: string
  name: string
  slug: string
  description: string | null
  parent_category_id: string | null
  metadata_schema_json: Record<string, unknown> | null
  children: CategoryResponse[]
}

export function useCategories() {
  return useQuery<CategoryResponse[]>({
    queryKey: ["categories"],
    queryFn: () => apiFetch<CategoryResponse[]>("/categories"),
  })
}

interface CategoryCreate {
  name: string
  description?: string
  parent_category_id?: string
  metadata_schema_json?: Record<string, unknown>
}

interface CategoryUpdate {
  name?: string
  description?: string
  parent_category_id?: string
  metadata_schema_json?: Record<string, unknown>
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CategoryCreate) =>
      apiFetch<CategoryResponse>("/categories", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] })
    },
  })
}

export function useUpdateCategory(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CategoryUpdate) =>
      apiFetch<CategoryResponse>(`/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] })
    },
  })
}

export function useAddItemCategory(itemId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (categoryId: string) =>
      apiFetch<{ status: string }>(`/items/${itemId}/categories`, {
        method: "POST",
        body: JSON.stringify({ category_id: categoryId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item", itemId] })
      qc.invalidateQueries({ queryKey: ["items"] })
    },
  })
}

export function useRemoveItemCategory(itemId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (categoryId: string) =>
      apiFetch<void>(`/items/${itemId}/categories/${categoryId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item", itemId] })
      qc.invalidateQueries({ queryKey: ["items"] })
    },
  })
}
