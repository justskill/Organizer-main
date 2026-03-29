import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"
import { toast } from "sonner"

export interface LabelQueueItem {
  id: string
  entity_type: "item" | "location"
  entity_id: string
  entity_name: string
  entity_code: string
  created_at: string
}

interface QueueEntity {
  entity_type: "item" | "location"
  entity_id: string
}

const QUEUE_KEY = ["label-queue"]

export function useLabelQueue() {
  return useQuery<LabelQueueItem[]>({
    queryKey: QUEUE_KEY,
    queryFn: () => apiFetch<LabelQueueItem[]>("/label-queue"),
  })
}

export function useAddToLabelQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entities: QueueEntity[]) =>
      apiFetch<LabelQueueItem[]>("/label-queue", {
        method: "POST",
        body: JSON.stringify({ entities }),
      }),
    onSuccess: (added) => {
      qc.invalidateQueries({ queryKey: QUEUE_KEY })
      const count = added.length
      if (count > 0) {
        toast.success(`Added ${count} to label queue`)
      } else {
        toast.info("Already in label queue")
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add to queue")
    },
  })
}

export function useRemoveFromLabelQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (queueItemId: string) => {
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`/api/v1/label-queue/${queueItemId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail || res.statusText)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_KEY })
    },
  })
}

export function useClearLabelQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("auth_token")
      const res = await fetch("/api/v1/label-queue", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail || res.statusText)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_KEY })
      toast.success("Label queue cleared")
    },
  })
}
