import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"
import type { ItemResponse } from "@/types"

export function useItem(id: string | undefined) {
  return useQuery<ItemResponse>({
    queryKey: ["item", id],
    queryFn: () => apiFetch<ItemResponse>(`/items/${id}`),
    enabled: !!id,
  })
}

export function useUpdateItem(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<ItemResponse>(`/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item", id] })
      qc.invalidateQueries({ queryKey: ["items"] })
    },
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] })
    },
  })
}

interface CreateItemResponse {
  item: ItemResponse
  duplicate_candidates: Array<{ id: string; code: string; name: string }>
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<CreateItemResponse>("/items", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] })
    },
  })
}

interface MoveRequest {
  location_id?: string | null
  container_id?: string | null
  note?: string
}

export function useMoveItem(itemId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: MoveRequest) =>
      apiFetch(`/items/${itemId}/move`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["item", itemId] })
      const previous = qc.getQueryData<ItemResponse>(["item", itemId])
      if (previous) {
        qc.setQueryData<ItemResponse>(["item", itemId], {
          ...previous,
          current_placement: {
            id: "optimistic",
            location_id: data.location_id ?? null,
            parent_item_id: data.container_id ?? null,
            location_name: null,
            container_name: null,
            placed_at: new Date().toISOString(),
          },
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["item", itemId], context.previous)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["item", itemId] })
      qc.invalidateQueries({ queryKey: ["items"] })
      qc.invalidateQueries({ queryKey: ["item-history", itemId] })
      qc.invalidateQueries({ queryKey: ["location-contents"] })
    },
  })
}

interface StockAdjustRequest {
  transaction_type: string
  quantity_delta: number
  reason?: string
  reference?: string
  unit_of_measure?: string
}

export function useAdjustStock(itemId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: StockAdjustRequest) =>
      apiFetch(`/items/${itemId}/adjust-stock`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["item", itemId] })
      const previous = qc.getQueryData<ItemResponse>(["item", itemId])
      if (previous && previous.quantity_on_hand != null) {
        qc.setQueryData<ItemResponse>(["item", itemId], {
          ...previous,
          quantity_on_hand: previous.quantity_on_hand + data.quantity_delta,
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(["item", itemId], context.previous)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["item", itemId] })
      qc.invalidateQueries({ queryKey: ["items"] })
      qc.invalidateQueries({ queryKey: ["item-history", itemId] })
    },
  })
}
