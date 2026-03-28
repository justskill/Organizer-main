import { useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import {
  ArrowLeft,
  Edit,
  FolderInput,
  PackageMinus,
  QrCode,
  Archive,
  MapPin,
  Clock,
  Link2,
  FileText,
  Image,
  StickyNote,
  BarChart3,
  Tag,
  Upload,
  Trash2,
  Star,
} from "lucide-react"
import { useItem, useAdjustStock, useDeleteItem, useContainerContents } from "@/hooks/useItem"
import { useItemHistory, type AuditEvent } from "@/hooks/useItemHistory"
import { useItemRelationships, type ItemRelationship } from "@/hooks/useItemRelationships"
import { useUploadMedia, useDeleteMedia, useSetPrimaryMedia } from "@/hooks/useMedia"
import { MoveItemsDialog } from "@/components/MoveItemsDialog"
import { CameraCapture } from "@/components/CameraCapture"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { apiFetch } from "@/api/client"
import type { ItemResponse } from "@/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateWithUrgency(d: string | null | undefined): { text: string; className: string } {
  if (!d) return { text: "—", className: "" }
  const due = new Date(d)
  const now = new Date()
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const text = due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })

  if (diffDays < 0) return { text: `${text} (overdue)`, className: "text-red-600 font-medium" }
  if (diffDays <= 7) return { text: `${text} (${diffDays}d)`, className: "text-orange-600 font-medium" }
  if (diffDays <= 30) return { text: `${text} (${diffDays}d)`, className: "text-yellow-600" }
  return { text, className: "" }
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const CONDITION_COLORS: Record<string, string> = {
  Available: "bg-green-100 text-green-800",
  In_Use: "bg-blue-100 text-blue-800",
  Loaned_Out: "bg-yellow-100 text-yellow-800",
  Needs_Repair: "bg-red-100 text-red-800",
  Retired: "bg-gray-100 text-gray-800",
}

const TRANSACTION_TYPES = ["add", "consume", "adjust", "count", "dispose", "return"] as const

const RELATIONSHIP_LABELS: Record<string, string> = {
  accessory_of: "Accessory of",
  spare_part_for: "Spare part for",
  compatible_with: "Compatible with",
  belongs_to_kit: "Belongs to kit",
  manual_for: "Manual for",
}

// ---------------------------------------------------------------------------
// Stock Adjust Dialog
// ---------------------------------------------------------------------------

function StockAdjustDialog({
  open,
  onOpenChange,
  itemId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string
}) {
  const [txnType, setTxnType] = useState("add")
  const [delta, setDelta] = useState("")
  const [reason, setReason] = useState("")
  const adjust = useAdjustStock(itemId)

  const handleSubmit = () => {
    const qty = parseFloat(delta)
    if (isNaN(qty) || qty === 0) return
    adjust.mutate(
      { transaction_type: txnType, quantity_delta: qty, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          onOpenChange(false)
          setDelta("")
          setReason("")
          setTxnType("add")
        },
      }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>Record a stock transaction for this item.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3" onKeyDown={handleKeyDown}>
          <div>
            <Label>Transaction Type</Label>
            <Select value={txnType} onChange={(e) => setTxnType(e.target.value)}>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Quantity Delta</Label>
            <Input
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="e.g. 5 or -3"
              autoFocus
            />
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for adjustment" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!delta || adjust.isPending}>
            {adjust.isPending ? "Saving..." : "Submit"}
          </Button>
        </DialogFooter>
        {adjust.isError && (
          <p className="text-sm text-destructive">{(adjust.error as Error).message}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Archive Confirm Dialog
// ---------------------------------------------------------------------------

function ArchiveDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ItemResponse
}) {
  const navigate = useNavigate()
  const deleteItem = useDeleteItem()

  const handleArchive = () => {
    deleteItem.mutate(item.id, {
      onSuccess: () => {
        onOpenChange(false)
        navigate("/items")
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive Item</DialogTitle>
          <DialogDescription>
            Are you sure you want to archive "{item.name}"? This action can be undone later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleArchive} disabled={deleteItem.isPending}>
            {deleteItem.isPending ? "Archiving..." : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Section Components
// ---------------------------------------------------------------------------

function SummarySection({ item }: { item: ItemResponse }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{item.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{item.code}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{item.item_type.replace("_", " ")}</Badge>
            {item.condition && (
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CONDITION_COLORS[item.condition] ?? ""}`}>
                {item.condition.replace("_", " ")}
              </span>
            )}
            {item.archived_at && <Badge variant="destructive">Archived</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {item.description && <p className="mb-4 text-sm">{item.description}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {item.brand && <InfoField label="Brand" value={item.brand} />}
          {item.categories && item.categories.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Categories</span>
              <div className="flex flex-wrap gap-1">
                {item.categories.map((c) => (
                  <Badge key={c.id} variant="secondary">{c.name}</Badge>
                ))}
              </div>
            </div>
          )}
          {item.model_number && <InfoField label="Model #" value={item.model_number} />}
          {item.part_number && <InfoField label="Part #" value={item.part_number} />}
          {item.serial_number && <InfoField label="Serial #" value={item.serial_number} />}
          {item.status && <InfoField label="Status" value={item.status} />}
          {item.quantity_on_hand != null && (
            <InfoField label="Quantity" value={`${Number(item.quantity_on_hand)}${item.unit_of_measure ? ` ${item.unit_of_measure}` : ""}`} />
          )}
          {item.minimum_quantity != null && <InfoField label="Min Qty" value={String(Number(item.minimum_quantity))} />}
          {item.purchase_date && <InfoField label="Purchase Date" value={formatDate(item.purchase_date)} />}
          {item.purchase_source && <InfoField label="Purchase Source" value={item.purchase_source} />}
          {item.purchase_price != null && <InfoField label="Purchase Price" value={`$${Number(item.purchase_price).toFixed(2)}`} />}
          {item.warranty_expiration && <InfoField label="Warranty Exp." value={formatDate(item.warranty_expiration)} />}
          {item.calibration_due_date && (() => {
            const u = formatDateWithUrgency(item.calibration_due_date)
            return <InfoField label="Calibration Due" value={u.text} className={u.className} />
          })()}
          {item.maintenance_due_date && (() => {
            const u = formatDateWithUrgency(item.maintenance_due_date)
            return <InfoField label="Maintenance Due" value={u.text} className={u.className} />
          })()}
        </div>
        {item.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Tag className="h-4 w-4 text-muted-foreground" />
            {item.tags.map((t) => (
              <Badge key={t.id} variant="secondary">{t.name}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function InfoField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`text-sm ${className ?? ""}`}>{value}</p>
    </div>
  )
}

function PhotoSection({ item }: { item: ItemResponse }) {
  const upload = useUploadMedia()
  const deleteMut = useDeleteMedia()
  const setPrimary = useSetPrimaryMedia()
  const [lightboxId, setLightboxId] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    upload.mutate({ file, ownerType: "item", ownerId: item.id })
    e.target.value = ""
  }

  const media = item.media ?? []
  const photos = media.filter((m) => m.mime_type?.startsWith("image/"))
  const lightboxPhoto = photos.find((m) => m.id === lightboxId)
  const lightboxIdx = photos.findIndex((m) => m.id === lightboxId)

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Image className="h-4 w-4" /> Photos</CardTitle>
            <div className="flex items-center gap-2">
              <CameraCapture
                onCapture={(file) => upload.mutate({ file, ownerType: "item", ownerId: item.id })}
              />
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <span className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted min-h-[36px]">
                  <Upload className="h-3.5 w-3.5" /> Upload
                </span>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {upload.isPending && <p className="text-sm text-muted-foreground mb-2">Uploading...</p>}
          {upload.isError && <p className="text-sm text-destructive mb-2">Upload failed: {(upload.error as Error).message}</p>}
          {photos.length === 0 && !upload.isPending ? (
            <p className="text-sm text-muted-foreground">No photos uploaded yet. Click Upload to add one.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {photos.map((m) => (
                <div key={m.id} className="group relative overflow-hidden rounded-md border">
                  <button className="w-full" onClick={() => setLightboxId(m.id)}>
                    <img src={`/api/v1/media/${m.id}`} alt={m.original_filename} className="h-40 w-full object-cover cursor-pointer" />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1">
                    <span className="truncate text-xs text-white">{m.original_filename}</span>
                    <div className="flex gap-1">
                      {!m.is_primary && (
                        <button
                          onClick={() => setPrimary.mutate(m.id)}
                          className="rounded p-1 text-white hover:bg-white/20"
                          title="Set as primary"
                        >
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {m.is_primary && <Star className="h-3.5 w-3.5 text-yellow-400 m-1" />}
                      <button
                        onClick={() => deleteMut.mutate(m.id)}
                        className="rounded p-1 text-white hover:bg-white/20"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxId(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={`/api/v1/media/${lightboxPhoto.id}`}
              alt={lightboxPhoto.original_filename}
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
            />
            <div className="absolute top-2 right-2 flex gap-2">
              <button
                onClick={() => setLightboxId(null)}
                className="rounded-full bg-black/60 px-3 py-1.5 text-sm text-white hover:bg-black/80"
              >
                ✕
              </button>
            </div>
            <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-4">
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => {
                      const prev = (lightboxIdx - 1 + photos.length) % photos.length
                      setLightboxId(photos[prev].id)
                    }}
                    className="rounded-full bg-black/60 px-3 py-1.5 text-sm text-white hover:bg-black/80"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-white">{lightboxIdx + 1} / {photos.length}</span>
                  <button
                    onClick={() => {
                      const next = (lightboxIdx + 1) % photos.length
                      setLightboxId(photos[next].id)
                    }}
                    className="rounded-full bg-black/60 px-3 py-1.5 text-sm text-white hover:bg-black/80"
                  >
                    Next →
                  </button>
                </>
              )}
            </div>
            <p className="absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
              {lightboxPhoto.original_filename}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function MetadataSection({ item }: { item: ItemResponse }) {
  if (!item.metadata_json || Object.keys(item.metadata_json).length === 0) return null
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Category Metadata</CardTitle></CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(item.metadata_json).map(([key, val]) => (
            <InfoField key={key} label={key} value={String(val ?? "—")} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function NotesSection({ item }: { item: ItemResponse }) {
  if (!item.notes) return null
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><StickyNote className="h-4 w-4" /> Notes</CardTitle></CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm">{item.notes}</p>
      </CardContent>
    </Card>
  )
}

function LocationSection({ item }: { item: ItemResponse }) {
  const placement = item.current_placement
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4" /> Current Location</CardTitle></CardHeader>
      <CardContent>
        {placement ? (
          <div>
            <Breadcrumb>
              <BreadcrumbList>
                {placement.location_name && (
                  <BreadcrumbItem>
                    <BreadcrumbPage>{placement.location_name}</BreadcrumbPage>
                  </BreadcrumbItem>
                )}
                {placement.container_name && (
                  <>
                    {placement.location_name && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      <BreadcrumbPage>{placement.container_name}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
            <p className="mt-1 text-xs text-muted-foreground">
              Placed {formatDateTime(placement.placed_at)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not assigned to any location.</p>
        )}
      </CardContent>
    </Card>
  )
}

function ContentsSection({ item }: { item: ItemResponse }) {
  const { data: contents, isLoading } = useContainerContents(item.id, item.is_container)
  if (!item.is_container) return null

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FolderInput className="h-4 w-4" /> Contents</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : !contents || contents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items in this container.</p>
        ) : (
          <div className="space-y-1">
            {contents.map((c) => (
              <Link
                key={c.id}
                to={`/items/${c.id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted min-h-[36px]"
              >
                <span className="flex-1 truncate">{c.name}</span>
                <Badge variant="outline" className="text-xs shrink-0">{c.item_type.replace("_", " ")}</Badge>
                <span className="text-xs text-muted-foreground shrink-0">{c.code}</span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RelationshipsSection({ itemId }: { itemId: string }) {
  const { data: relationships, isLoading } = useItemRelationships(itemId)

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Relationships</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : !relationships || relationships.length === 0 ? (
          <p className="text-sm text-muted-foreground">No relationships defined.</p>
        ) : (
          <div className="space-y-2">
            {relationships.map((r: ItemRelationship) => (
              <div key={r.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{RELATIONSHIP_LABELS[r.relationship_type] ?? r.relationship_type}</span>
                  <span className="ml-2 text-muted-foreground">
                    {r.source_item_id === itemId ? r.target_item_id : r.source_item_id}
                  </span>
                </div>
                {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HistorySection({ itemId }: { itemId: string }) {
  const { data: events, isLoading } = useItemHistory(itemId)

  const movementEvents = events?.filter((e: AuditEvent) => e.event_type === "moved" || e.event_type === "movement") ?? []
  const stockEvents = events?.filter((e: AuditEvent) => e.event_type === "stock_adjusted") ?? []
  const otherEvents = events?.filter((e: AuditEvent) => !["moved", "movement", "stock_adjusted"].includes(e.event_type)) ?? []

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" /> History</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history recorded.</p>
        ) : (
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({events.length})</TabsTrigger>
              <TabsTrigger value="movement">Movement ({movementEvents.length})</TabsTrigger>
              <TabsTrigger value="stock">Stock ({stockEvents.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <EventList events={events} />
            </TabsContent>
            <TabsContent value="movement">
              <EventList events={movementEvents} />
            </TabsContent>
            <TabsContent value="stock">
              <EventList events={stockEvents} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

function EventList({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return <p className="py-2 text-sm text-muted-foreground">No events.</p>
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto">
      {events.map((e) => (
        <div key={e.id} className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted/50">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{e.event_type}</Badge>
            {e.event_data_json && (
              <span className="text-xs text-muted-foreground">
                {JSON.stringify(e.event_data_json).slice(0, 80)}
              </span>
            )}
          </div>
          <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
        </div>
      ))}
    </div>
  )
}

function FilesSection({ item }: { item: ItemResponse }) {
  const upload = useUploadMedia()
  const deleteMut = useDeleteMedia()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    upload.mutate({ file, ownerType: "item", ownerId: item.id })
    e.target.value = ""
  }

  const media = item.media ?? []
  const files = media.filter((m) => !m.mime_type?.startsWith("image/"))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Files</CardTitle>
          <label className="cursor-pointer">
            <input type="file" className="hidden" onChange={handleFileChange} />
            <span className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted min-h-[36px]">
              <Upload className="h-3.5 w-3.5" /> Upload
            </span>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {upload.isPending && <p className="text-sm text-muted-foreground mb-2">Uploading...</p>}
        {files.length === 0 && !upload.isPending ? (
          <p className="text-sm text-muted-foreground">No files attached. Click Upload to add one.</p>
        ) : (
          <div className="space-y-1">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted/50">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`/api/v1/media/${f.id}`} target="_blank" rel="noopener noreferrer" className="truncate text-sm hover:underline">{f.original_filename}</a>
                  <span className="text-xs text-muted-foreground shrink-0">{(f.file_size / 1024).toFixed(0)} KB</span>
                </div>
                <button onClick={() => deleteMut.mutate(f.id)} className="text-muted-foreground hover:text-destructive shrink-0 p-1" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

async function downloadLabelPdf(
  entityType: "item" | "location",
  entityId: string,
  format: "adhesive" | "sheet",
  code: string
): Promise<void> {
  const token = localStorage.getItem("auth_token")
  const res = await fetch("/api/v1/labels/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ entity_type: entityType, entity_id: entityId, format }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || res.statusText)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `label-${code}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function LabelSection({ item }: { item: ItemResponse }) {
  const navigate = useNavigate()

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><QrCode className="h-4 w-4" /> Label / QR</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded border bg-muted">
            <QrCode className="h-12 w-12 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">{item.code}</p>
            <p className="text-xs text-muted-foreground">Scan path: /scan/{item.code}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 min-h-[36px]"
              onClick={() => navigate(`/labels?select=item:${item.id}`)}
            >
              <QrCode className="mr-1.5 h-4 w-4" />
              Generate Label
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: item, isLoading, isError } = useItem(id)

  const [moveOpen, setMoveOpen] = useState(false)
  const [stockOpen, setStockOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (isError || !item) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-sm text-destructive">Item not found or failed to load.</p>
        <Button variant="outline" onClick={() => navigate("/items")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Items
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/items")} aria-label="Back to items">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/items">Items</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{item.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="min-h-[44px]" asChild>
            <Link to={`/items/${item.id}/edit`}>
              <Edit className="mr-1.5 h-4 w-4" /> Edit
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setMoveOpen(true)}>
            <FolderInput className="mr-1.5 h-4 w-4" /> Move
          </Button>
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setStockOpen(true)}>
            <BarChart3 className="mr-1.5 h-4 w-4" /> Adjust Stock
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => navigate(`/labels?select=item:${item.id}`)}
          >
            <QrCode className="mr-1.5 h-4 w-4" /> Generate Label
          </Button>
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setArchiveOpen(true)}>
            <Archive className="mr-1.5 h-4 w-4" /> Archive
          </Button>
        </div>
      </div>

      <Separator />

      {/* Content sections */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SummarySection item={item} />
          <PhotoSection item={item} />
          <MetadataSection item={item} />
          <NotesSection item={item} />
          <HistorySection itemId={item.id} />
        </div>
        <div className="space-y-6">
          <LocationSection item={item} />
          <ContentsSection item={item} />
          <RelationshipsSection itemId={item.id} />
          <FilesSection item={item} />
          <LabelSection item={item} />
        </div>
      </div>

      {/* Dialogs */}
      <MoveItemsDialog open={moveOpen} onOpenChange={setMoveOpen} itemIds={[item.id]} />
      <StockAdjustDialog open={stockOpen} onOpenChange={setStockOpen} itemId={item.id} />
      <ArchiveDialog open={archiveOpen} onOpenChange={setArchiveOpen} item={item} />
    </div>
  )
}
