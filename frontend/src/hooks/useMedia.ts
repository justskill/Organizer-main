import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/api/client"

export interface MediaResponse {
  id: string
  owner_type: string
  owner_id: string
  media_type: string | null
  file_path: string
  original_filename: string
  mime_type: string
  file_size: number
  checksum: string | null
  is_primary: boolean
}

/**
 * Upload a media file for an item or location.
 * Uses FormData (multipart) instead of JSON since the backend expects file upload.
 */
export function useUploadMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      file: File
      ownerType: string
      ownerId: string
    }) => {
      const formData = new FormData()
      formData.append("file", params.file)
      formData.append("owner_type", params.ownerType)
      formData.append("owner_id", params.ownerId)

      const token = localStorage.getItem("auth_token")
      const res = await fetch("/api/v1/media/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail || res.statusText)
      }
      return res.json() as Promise<MediaResponse>
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["item", vars.ownerId] })
      qc.invalidateQueries({ queryKey: ["items"] })
    },
  })
}

/** Delete a media asset by ID. */
export function useDeleteMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mediaId: string) =>
      apiFetch<void>(`/media/${mediaId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item"] })
      qc.invalidateQueries({ queryKey: ["items"] })
    },
  })
}

/** Set a media asset as the primary photo for its owner. */
export function useSetPrimaryMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mediaId: string) =>
      apiFetch<MediaResponse>(`/media/${mediaId}/set-primary`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["item"] })
      qc.invalidateQueries({ queryKey: ["items"] })
    },
  })
}
