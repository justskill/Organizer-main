import { useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import {
  ArrowLeft,
  Edit,
  FolderInput,
  FolderPlus,
  QrCode,
  MapPin,
  Package,
  FolderOpen,
  Tag,
  StickyNote,
  ListPlus,
} from "lucide-react"
import { useLocation, useLocationContents } from "@/hooks/useLocations"
import { MoveLocationDialog } from "@/components/MoveLocationDialog"
import { useAddToLabelQueue } from "@/hooks/useLabelQueue"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
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

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: location, isLoading, isError } = useLocation(id)
  const { data: contents, isLoading: contentsLoading } = useLocationContents(id)
  const [moveOpen, setMoveOpen] = useState(false)
  const addToQueue = useAddToLabelQueue()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (isError || !location) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-sm text-destructive">Location not found or failed to load.</p>
        <Button variant="outline" onClick={() => navigate("/locations")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Locations
        </Button>
      </div>
    )
  }

  const pathParts = location.path_text ? location.path_text.split(" > ") : []
  const childLocations = contents?.child_locations ?? []
  const items = contents?.items ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/locations")} aria-label="Back to locations">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/locations">Locations</BreadcrumbLink>
                </BreadcrumbItem>
                {pathParts.map((part, i) => (
                  <span key={i} className="contents">
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {i === pathParts.length - 1 ? (
                        <BreadcrumbPage>{part}</BreadcrumbPage>
                      ) : (
                        <span className="text-sm text-muted-foreground">{part}</span>
                      )}
                    </BreadcrumbItem>
                  </span>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/locations/${location.id}/edit`}><Edit className="mr-1.5 h-4 w-4" /> Edit</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
            <FolderInput className="mr-1.5 h-4 w-4" /> Move
          </Button>
          <MoveLocationDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            locationId={location.id}
            locationName={location.name}
          />
          <Button variant="outline" size="sm" disabled>
            <FolderPlus className="mr-1.5 h-4 w-4" /> Add Child Location
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/labels?select=location:${location.id}`)}
          >
            <QrCode className="mr-1.5 h-4 w-4" /> Generate Label
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addToQueue.mutate([{ entity_type: "location", entity_id: location.id }])}
            disabled={addToQueue.isPending}
          >
            <ListPlus className="mr-1.5 h-4 w-4" /> Add to Label Queue
          </Button>
        </div>
      </div>

      <Separator />

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main info */}
        <div className="space-y-6 lg:col-span-2">
          {/* Summary card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{location.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{location.code}</p>
                </div>
                <div className="flex gap-2">
                  {location.location_type && (
                    <Badge variant="outline">{location.location_type}</Badge>
                  )}
                  {location.archived_at && <Badge variant="destructive">Archived</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {location.description && <p className="mb-4 text-sm">{location.description}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoField label="Code" value={location.code} />
                {location.location_type && <InfoField label="Type" value={location.location_type} />}
                <InfoField label="Created" value={formatDate(location.created_at)} />
                <InfoField label="Updated" value={formatDate(location.updated_at)} />
                {location.path_text && <InfoField label="Full Path" value={location.path_text} />}
              </div>
              {location.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  {location.tags.map((t) => (
                    <Badge key={t.id} variant="secondary">{t.name}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {location.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <StickyNote className="h-4 w-4" /> Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{location.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Contents: child locations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderOpen className="h-4 w-4" /> Child Locations ({contentsLoading ? "…" : childLocations.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contentsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : childLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No child locations.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {childLocations.map((child) => (
                    <Link key={child.id} to={`/locations/${child.id}`}>
                      <div className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/30 min-h-[44px]">
                        <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{child.name}</p>
                          <p className="text-xs text-muted-foreground">{child.code}</p>
                        </div>
                        {child.location_type && (
                          <Badge variant="outline" className="ml-auto text-xs">{child.location_type}</Badge>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contents: items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" /> Items ({contentsLoading ? "…" : items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contentsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items at this location.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((item) => (
                    <Link key={item.id} to={`/items/${item.id}`}>
                      <div className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/30 min-h-[44px]">
                        <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.code}</p>
                        </div>
                        <Badge variant="outline" className="ml-auto text-xs">
                          {item.item_type.replace("_", " ")}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* QR / Label */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <QrCode className="h-4 w-4" /> Label / QR
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex h-24 w-24 items-center justify-center rounded border bg-muted">
                  <QrCode className="h-12 w-12 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{location.code}</p>
                  <p className="text-xs text-muted-foreground">Scan path: /scan/{location.code}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 min-h-[36px]"
                    onClick={() => navigate(`/labels?select=location:${location.id}`)}
                  >
                    <QrCode className="mr-1.5 h-4 w-4" />
                    Generate Label
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parent location */}
          {location.parent_location_id && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4" /> Parent Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  to={`/locations/${location.parent_location_id}`}
                  className="text-sm text-primary hover:underline"
                >
                  View parent location
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
