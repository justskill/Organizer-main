import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Save, Camera, X, Loader2, ImagePlus } from "lucide-react"
import { toast } from "sonner"
import { useItem, useCreateItem, useUpdateItem } from "@/hooks/useItem"
import { useCategories } from "@/hooks/useCategories"
import { Badge } from "@/components/ui/badge"
import { apiFetch } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import ReviewPanel, { applyClassificationToForm } from "@/components/ReviewPanel"
import { CameraCapture } from "@/components/CameraCapture"
import type { ItemType, ItemCondition } from "@/types"

const ITEM_TYPES: ItemType[] = [
  "Consumable", "Equipment", "Component", "Tool", "Container", "Kit", "Documented_Reference",
]

const ITEM_CONDITIONS: ItemCondition[] = [
  "Available", "In_Use", "Loaned_Out", "Needs_Repair", "Retired",
]

export interface ClassificationField {
  field_name: "name" | "description" | "item_type" | "brand" | "model_number" | "part_number" | "condition" | "is_consumable"
  value: string
  confidence: "high" | "medium" | "low"
}

export interface ClassificationResult {
  fields: ClassificationField[]
}

export interface FormData {
  name: string
  item_type: ItemType
  description: string
  brand: string
  model_number: string
  part_number: string
  serial_number: string
  condition: string
  status: string
  is_container: boolean
  is_consumable: boolean
  is_serialized: boolean
  quantity_on_hand: string
  minimum_quantity: string
  reorder_quantity: string
  unit_of_measure: string
  purchase_date: string
  purchase_source: string
  purchase_price: string
  warranty_expiration: string
  calibration_due_date: string
  maintenance_due_date: string
  notes: string
  category_ids: string[]
}

export const EMPTY_FORM: FormData = {
  name: "",
  item_type: "Equipment",
  description: "",
  brand: "",
  model_number: "",
  part_number: "",
  serial_number: "",
  condition: "",
  status: "",
  is_container: false,
  is_consumable: false,
  is_serialized: false,
  quantity_on_hand: "0",
  minimum_quantity: "",
  reorder_quantity: "",
  unit_of_measure: "",
  purchase_date: "",
  purchase_source: "",
  purchase_price: "",
  warranty_expiration: "",
  calibration_due_date: "",
  maintenance_due_date: "",
  notes: "",
  category_ids: [],
}

export default function ItemForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = !!id

  const { data: existingItem, isLoading: itemLoading } = useItem(isEdit ? id : undefined)
  const createItem = useCreateItem()
  const updateItem = useUpdateItem(id ?? "")
  const { data: categories } = useCategories()

  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Classification state
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [classifying, setClassifying] = useState(false)
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null)
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null)
  const [savePhotosToItem, setSavePhotosToItem] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check classification settings on mount (only for new items)
  useEffect(() => {
    if (isEdit) return
    apiFetch<{ has_api_key: boolean }>("/settings/classification")
      .then((data) => setApiKeyConfigured(data.has_api_key))
      .catch(() => setApiKeyConfigured(false))
  }, [isEdit])
  // Populate form when editing
  useEffect(() => {
    if (existingItem && isEdit) {
      setForm({
        name: existingItem.name,
        item_type: existingItem.item_type,
        description: existingItem.description ?? "",
        brand: existingItem.brand ?? "",
        model_number: existingItem.model_number ?? "",
        part_number: existingItem.part_number ?? "",
        serial_number: existingItem.serial_number ?? "",
        condition: existingItem.condition ?? "",
        status: existingItem.status ?? "",
        is_container: existingItem.is_container,
        is_consumable: existingItem.is_consumable,
        is_serialized: existingItem.is_serialized,
        quantity_on_hand: existingItem.quantity_on_hand != null ? String(Number(existingItem.quantity_on_hand)) : "0",
        minimum_quantity: existingItem.minimum_quantity != null ? String(Number(existingItem.minimum_quantity)) : "",
        reorder_quantity: existingItem.reorder_quantity != null ? String(Number(existingItem.reorder_quantity)) : "",
        unit_of_measure: existingItem.unit_of_measure ?? "",
        purchase_date: existingItem.purchase_date ?? "",
        purchase_source: existingItem.purchase_source ?? "",
        purchase_price: existingItem.purchase_price != null ? String(Number(existingItem.purchase_price)) : "",
        warranty_expiration: existingItem.warranty_expiration ?? "",
        calibration_due_date: existingItem.calibration_due_date ?? "",
        maintenance_due_date: existingItem.maintenance_due_date ?? "",
        notes: existingItem.notes ?? "",
        category_ids: existingItem.categories?.map((c) => c.id) ?? [],
      })
    }
  }, [existingItem, isEdit])

  const set = (field: keyof FormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = "Name is required"
    if (!form.item_type) errs.item_type = "Item type is required"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      item_type: form.item_type,
    }
    if (form.description) payload.description = form.description
    if (form.brand) payload.brand = form.brand
    if (form.model_number) payload.model_number = form.model_number
    if (form.part_number) payload.part_number = form.part_number
    if (form.serial_number) payload.serial_number = form.serial_number
    if (form.condition) payload.condition = form.condition
    if (form.status) payload.status = form.status
    payload.is_container = form.is_container
    payload.is_consumable = form.is_consumable
    payload.is_serialized = form.is_serialized
    if (form.quantity_on_hand) payload.quantity_on_hand = parseFloat(form.quantity_on_hand) || 0
    if (form.minimum_quantity) payload.minimum_quantity = parseFloat(form.minimum_quantity)
    if (form.reorder_quantity) payload.reorder_quantity = parseFloat(form.reorder_quantity)
    if (form.unit_of_measure) payload.unit_of_measure = form.unit_of_measure
    if (form.purchase_date) payload.purchase_date = form.purchase_date
    if (form.purchase_source) payload.purchase_source = form.purchase_source
    if (form.purchase_price) payload.purchase_price = parseFloat(form.purchase_price)
    if (form.warranty_expiration) payload.warranty_expiration = form.warranty_expiration
    if (form.calibration_due_date) payload.calibration_due_date = form.calibration_due_date
    if (form.maintenance_due_date) payload.maintenance_due_date = form.maintenance_due_date
    if (form.notes) payload.notes = form.notes
    return payload
  }

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setSelectedImages((prev) => [...prev, ...Array.from(files)])
  }

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleClassify = async () => {
    if (selectedImages.length === 0) return
    setClassifying(true)
    try {
      const token = localStorage.getItem("auth_token")
      const formData = new FormData()
      selectedImages.forEach((file) => formData.append("files", file))
      const res = await fetch("/api/v1/classify/image", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail || res.statusText)
      }
      const result: ClassificationResult = await res.json()
      setClassificationResult(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Classification failed")
    } finally {
      setClassifying(false)
    }
  }

  const uploadClassificationPhotos = async (itemId: string) => {
    if (!savePhotosToItem || selectedImages.length === 0) return
    const token = localStorage.getItem("auth_token")
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    for (const file of selectedImages) {
      const fd = new globalThis.FormData()
      fd.append("file", file)
      fd.append("owner_type", "item")
      fd.append("owner_id", itemId)
      await fetch("/api/v1/media/upload", { method: "POST", headers, body: fd })
    }
  }

  const syncCategories = async (itemId: string) => {
    const existing = existingItem?.categories?.map((c) => c.id) ?? []
    const toAdd = form.category_ids.filter((id) => !existing.includes(id))
    const toRemove = existing.filter((id) => !form.category_ids.includes(id))
    const token = localStorage.getItem("auth_token")
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) headers.Authorization = `Bearer ${token}`
    await Promise.all([
      ...toAdd.map((catId) =>
        fetch(`/api/v1/items/${itemId}/categories`, {
          method: "POST", headers, body: JSON.stringify({ category_id: catId }),
        })
      ),
      ...toRemove.map((catId) =>
        fetch(`/api/v1/items/${itemId}/categories/${catId}`, { method: "DELETE", headers })
      ),
    ])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const payload = buildPayload()

    if (isEdit) {
      updateItem.mutate(payload, {
        onSuccess: async () => {
          await syncCategories(id!)
          navigate(`/items/${id}`)
        },
      })
    } else {
      createItem.mutate(payload, {
        onSuccess: async (data) => {
          await syncCategories(data.item.id)
          await uploadClassificationPhotos(data.item.id)
          navigate(`/items/${data.item.id}`)
        },
      })
    }
  }

  const isPending = createItem.isPending || updateItem.isPending
  const mutationError = createItem.isError
    ? (createItem.error as Error).message
    : updateItem.isError
      ? (updateItem.error as Error).message
      : null

  if (isEdit && itemLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(isEdit ? `/items/${id}` : "/items")} aria-label="Go back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? "Edit Item" : "New Item"}
        </h1>
      </div>

      <Separator />

      <form onSubmit={handleSubmit} className="space-y-6" onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          navigate(isEdit ? `/items/${id}` : "/items")
        }
      }}>
        {/* Basic Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Item name"
                />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
              </div>
              <div>
                <Label htmlFor="item_type">Type *</Label>
                <Select id="item_type" value={form.item_type} onChange={(e) => set("item_type", e.target.value)}>
                  {ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace("_", " ")}</option>
                  ))}
                </Select>
                {errors.item_type && <p className="mt-1 text-xs text-destructive">{errors.item_type}</p>}
              </div>
            </div>
            <div>
              <Label>Categories</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {(categories ?? []).map((c) => {
                  const selected = form.category_ids.includes(c.id)
                  return (
                    <Badge
                      key={c.id}
                      variant={selected ? "default" : "outline"}
                      className="cursor-pointer select-none"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          category_ids: selected
                            ? prev.category_ids.filter((id) => id !== c.id)
                            : [...prev.category_ids, c.id],
                        }))
                      }
                    >
                      {c.name}
                    </Badge>
                  )
                })}
                {(categories ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">No categories yet. Create them in Settings.</span>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_container} onChange={(e) => set("is_container", e.target.checked)} className="rounded" />
                Container
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_consumable} onChange={(e) => set("is_consumable", e.target.checked)} className="rounded" />
                Consumable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_serialized} onChange={(e) => set("is_serialized", e.target.checked)} className="rounded" />
                Serialized
              </label>
            </div>

            {/* Classification section - only shown for new items */}
            {!isEdit && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">AI Classification</span>
                  </div>
                </div>

                {apiKeyConfigured === false && (
                  <p className="text-xs text-muted-foreground">
                    No API key configured. Go to{" "}
                    <span className="font-medium text-foreground">Settings → AI Classification</span>{" "}
                    to enable this feature.
                  </p>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={handleFilesSelected}
                  onClick={(e) => { (e.target as HTMLInputElement).value = "" }}
                />

                <div className="flex flex-wrap gap-2 items-start">
                  <CameraCapture
                    disabled={apiKeyConfigured !== true || classifying}
                    onCapture={(file) => setSelectedImages((prev) => [...prev, file])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={apiKeyConfigured !== true || classifying}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="mr-1.5 h-4 w-4" />
                    {selectedImages.length > 0 ? "Add More" : "Choose Photos"}
                  </Button>
                </div>

                {/* Thumbnail previews */}
                {selectedImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedImages.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="relative group">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="h-16 w-16 rounded-md object-cover border"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive text-destructive-foreground p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Classify submit button */}
                {selectedImages.length > 0 && (
                  <Button
                    type="button"
                    onClick={handleClassify}
                    disabled={classifying}
                  >
                    {classifying ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Classifying...
                      </>
                    ) : (
                      <>
                        <Camera className="mr-1.5 h-4 w-4" />
                        Classify {selectedImages.length} {selectedImages.length === 1 ? "Photo" : "Photos"}
                      </>
                    )}
                  </Button>
                )}

                {/* Review Panel */}
                {classificationResult && (
                  <ReviewPanel
                    result={classificationResult}
                    onApply={(acceptedFields) => {
                      setForm((prev) => applyClassificationToForm(prev, acceptedFields))
                      setClassificationResult(null)
                    }}
                    onDiscard={() => {
                      setClassificationResult(null)
                      setSavePhotosToItem(false)
                    }}
                    showSavePhotos={selectedImages.length > 0}
                    savePhotos={savePhotosToItem}
                    onSavePhotosChange={setSavePhotosToItem}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Identification */}
        <Card>
          <CardHeader><CardTitle className="text-base">Identification</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="brand">Brand</Label>
                <Input id="brand" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="model_number">Model #</Label>
                <Input id="model_number" value={form.model_number} onChange={(e) => set("model_number", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="part_number">Part #</Label>
                <Input id="part_number" value={form.part_number} onChange={(e) => set("part_number", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="serial_number">Serial #</Label>
                <Input id="serial_number" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Condition & Status */}
        <Card>
          <CardHeader><CardTitle className="text-base">Condition & Status</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="condition">Condition</Label>
                <Select id="condition" value={form.condition} onChange={(e) => set("condition", e.target.value)}>
                  <option value="">— Select —</option>
                  {ITEM_CONDITIONS.map((c) => (
                    <option key={c} value={c}>{c.replace("_", " ")}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Input id="status" value={form.status} onChange={(e) => set("status", e.target.value)} placeholder="e.g. Active" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stock */}
        <Card>
          <CardHeader><CardTitle className="text-base">Stock & Quantity</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="quantity_on_hand">Quantity</Label>
                <Input id="quantity_on_hand" type="number" value={form.quantity_on_hand} onChange={(e) => set("quantity_on_hand", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="unit_of_measure">Unit</Label>
                <Input id="unit_of_measure" value={form.unit_of_measure} onChange={(e) => set("unit_of_measure", e.target.value)} placeholder="e.g. pcs" />
              </div>
              <div>
                <Label htmlFor="minimum_quantity">Min Qty</Label>
                <Input id="minimum_quantity" type="number" value={form.minimum_quantity} onChange={(e) => set("minimum_quantity", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="reorder_quantity">Reorder Qty</Label>
                <Input id="reorder_quantity" type="number" value={form.reorder_quantity} onChange={(e) => set("reorder_quantity", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dates */}
        <Card>
          <CardHeader><CardTitle className="text-base">Dates</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="purchase_date">Purchase Date</Label>
                <Input id="purchase_date" type="date" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="purchase_source">Purchase Source</Label>
                <Input id="purchase_source" value={form.purchase_source} onChange={(e) => set("purchase_source", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="purchase_price">Purchase Price</Label>
                <Input id="purchase_price" type="number" step="0.01" value={form.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="warranty_expiration">Warranty Expiration</Label>
                <Input id="warranty_expiration" type="date" value={form.warranty_expiration} onChange={(e) => set("warranty_expiration", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="calibration_due_date">Calibration Due</Label>
                <Input id="calibration_due_date" type="date" value={form.calibration_due_date} onChange={(e) => set("calibration_due_date", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="maintenance_due_date">Maintenance Due</Label>
                <Input id="maintenance_due_date" type="date" value={form.maintenance_due_date} onChange={(e) => set("maintenance_due_date", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Additional notes..."
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        {mutationError && (
          <p className="text-sm text-destructive">{mutationError}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `/items/${id}` : "/items")}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            <Save className="mr-1.5 h-4 w-4" />
            {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Item"}
          </Button>
        </div>
      </form>
    </div>
  )
}
