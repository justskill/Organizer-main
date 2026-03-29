import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import {
  ChevronRight,
  ChevronDown,
  MapPin,
  Package,
  FolderInput,
  FolderOpen,
  Tag,
  StickyNote,
  X,
  Plus,
  ListPlus,
} from "lucide-react"
import { useLocations, useLocationContents } from "@/hooks/useLocations"
import { useTags } from "@/hooks/useTags"
import { MoveLocationDialog } from "@/components/MoveLocationDialog"
import { useAddToLabelQueue } from "@/hooks/useLabelQueue"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { cn } from "@/lib/utils"
import type { LocationResponse } from "@/types"

// ---------------------------------------------------------------------------
// LocationTree — recursive tree sidebar
// ---------------------------------------------------------------------------

function LocationTreeItem({
  location,
  selectedId,
  onSelect,
  depth = 0,
}: {
  location: LocationResponse
  selectedId: string | null
  onSelect: (loc: LocationResponse) => void
  depth?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = location.children && location.children.length > 0
  const isSelected = selectedId === location.id

  return (
    <div>
      <button
        className={cn(
          "flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 text-left min-h-[44px]",
          isSelected && "bg-muted font-medium"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          onSelect(location)
          if (hasChildren) setExpanded(!expanded)
        }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{location.name}</span>
        {location.location_type && (
          <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0">
            {location.location_type}
          </Badge>
        )}
      </button>
      {expanded && hasChildren && (
        <div>
          {location.children.map((child) => (
            <LocationTreeItem
              key={child.id}
              location={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LocationBreadcrumb
// ---------------------------------------------------------------------------

function LocationBreadcrumb({ pathText }: { pathText: string | null }) {
  if (!pathText) return null
  const parts = pathText.split(" > ")
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/locations">Locations</BreadcrumbLink>
        </BreadcrumbItem>
        {parts.map((part, i) => (
          <span key={i} className="contents">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {i === parts.length - 1 ? (
                <BreadcrumbPage>{part}</BreadcrumbPage>
              ) : (
                <span className="text-sm text-muted-foreground">{part}</span>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

// ---------------------------------------------------------------------------
// Contents Panel
// ---------------------------------------------------------------------------

function ContentsPanel({ locationId }: { locationId: string }) {
  const { data, isLoading, isError } = useLocationContents(locationId)
  const [moveOpen, setMoveOpen] = useState(false)
  const addToQueue = useAddToLabelQueue()

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return <p className="text-sm text-destructive">Failed to load location contents.</p>
  }

  const { location, items, child_locations } = data

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <LocationBreadcrumb pathText={location.path_text} />

      {/* Location info */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">{location.name}</h2>
          <Badge variant="outline">{location.code}</Badge>
          {location.location_type && (
            <Badge variant="secondary">{location.location_type}</Badge>
          )}
        </div>
        {location.description && (
          <p className="mt-1 text-sm text-muted-foreground">{location.description}</p>
        )}
        <div className="mt-2 flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/locations/${location.id}`}>View Details</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
            <FolderInput className="mr-1.5 h-4 w-4" /> Move
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addToQueue.mutate([{ entity_type: "location", entity_id: location.id }])}
            disabled={addToQueue.isPending}
          >
            <ListPlus className="mr-1.5 h-4 w-4" /> Label Queue
          </Button>
          <MoveLocationDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            locationId={location.id}
            locationName={location.name}
          />
        </div>
      </div>

      {/* Tags */}
      {location.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="h-4 w-4 text-muted-foreground" />
          {location.tags.map((t) => (
            <Badge key={t.id} variant="secondary">{t.name}</Badge>
          ))}
        </div>
      )}

      {/* Notes */}
      {location.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-4 w-4" /> Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{location.notes}</p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Child locations */}
      {child_locations.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            Child Locations ({child_locations.length})
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {child_locations.map((child) => (
              <Link key={child.id} to={`/locations/${child.id}`}>
                <Card className="transition-colors hover:bg-muted/30">
                  <CardContent className="flex items-center gap-3 p-3">
                    <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{child.name}</p>
                      <p className="text-xs text-muted-foreground">{child.code}</p>
                    </div>
                    {child.location_type && (
                      <Badge variant="outline" className="ml-auto text-xs">
                        {child.location_type}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Items at this location */}
      {items.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            Items ({items.length})
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <Link key={item.id} to={`/items/${item.id}`}>
                <Card className="transition-colors hover:bg-muted/30">
                  <CardContent className="flex items-center gap-3 p-3">
                    <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.code}</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-xs">
                      {item.item_type.replace("_", " ")}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {child_locations.length === 0 && items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">This location is empty.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Locations() {
  const [selectedLocation, setSelectedLocation] = useState<LocationResponse | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [tagMode, setTagMode] = useState<"and" | "or">("or")
  const [showTree, setShowTree] = useState(false)
  const { data, isLoading, isError } = useLocations({ rootOnly: false })
  const { data: allTags = [] } = useTags()

  // Build root locations (those without parent)
  const allLocations = data?.locations ?? []

  // Filter locations by selected tags
  const filteredLocations = useMemo(() => {
    if (selectedTagIds.length === 0) return allLocations
    return allLocations.filter((loc) => {
      if (tagMode === "and") {
        return selectedTagIds.every((tid) => loc.tags.some((t) => t.id === tid))
      }
      return selectedTagIds.some((tid) => loc.tags.some((t) => t.id === tid))
    })
  }, [allLocations, selectedTagIds, tagMode])

  const rootLocations = filteredLocations.filter((l) => !l.parent_location_id)

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Explore your storage locations and hierarchy.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link to="/locations/new"><Plus className="mr-1.5 h-4 w-4" />Add New</Link>
        </Button>
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          {allTags.map((t) => {
            const active = selectedTagIds.includes(t.id)
            return (
              <button
                key={t.id}
                onClick={() => toggleTag(t.id)}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs transition-colors min-h-[28px]",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {t.color && (
                  <span
                    className="mr-1 h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                )}
                {t.name}
                {active && <X className="ml-1 h-3 w-3" />}
              </button>
            )
          })}
          {selectedTagIds.length > 1 && (
            <>
              <Separator orientation="vertical" className="h-4 mx-1" />
              <button
                onClick={() => setTagMode("or")}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded",
                  tagMode === "or" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                Any
              </button>
              <button
                onClick={() => setTagMode("and")}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded",
                  tagMode === "and" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                All
              </button>
            </>
          )}
          {selectedTagIds.length > 0 && (
            <button
              onClick={() => setSelectedTagIds([])}
              className="text-xs text-muted-foreground hover:text-foreground ml-1"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row">
        {/* Mobile tree toggle */}
        <div className="md:hidden">
          <Button
            variant={showTree ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowTree(!showTree)}
            className="w-full"
          >
            <MapPin className="mr-1.5 h-4 w-4" />
            {showTree ? "Hide Location Tree" : "Show Location Tree"}
          </Button>
          {showTree && (
            <div className="mt-2 rounded-lg border bg-card p-2 overflow-y-auto max-h-[50vh]">
              <h3 className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Location Tree
              </h3>
              {isLoading && (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-full" />
                  ))}
                </div>
              )}
              {!isLoading && !isError && rootLocations.map((loc) => (
                <LocationTreeItem
                  key={loc.id}
                  location={loc}
                  selectedId={selectedLocation?.id ?? null}
                  onSelect={(loc) => {
                    setSelectedLocation(loc)
                    setShowTree(false)
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Desktop tree sidebar */}
        <div className="hidden w-64 shrink-0 rounded-lg border bg-card p-2 md:block overflow-y-auto max-h-[calc(100vh-12rem)]">
          <h3 className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Location Tree
          </h3>
          {isLoading && (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          )}
          {isError && (
            <p className="p-2 text-sm text-destructive">Failed to load locations.</p>
          )}
          {!isLoading && !isError && rootLocations.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">No locations yet.</p>
          )}
          {!isLoading && !isError && rootLocations.map((loc) => (
            <LocationTreeItem
              key={loc.id}
              location={loc}
              selectedId={selectedLocation?.id ?? null}
              onSelect={setSelectedLocation}
            />
          ))}
        </div>

        {/* Contents panel */}
        <div className="min-w-0 flex-1">
          {selectedLocation ? (
            <ContentsPanel locationId={selectedLocation.id} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12">
                <MapPin className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Select a location from the tree to view its contents.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
