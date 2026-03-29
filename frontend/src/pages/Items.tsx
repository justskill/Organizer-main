import { useState, useMemo, useCallback } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table"
import {
  LayoutGrid,
  LayoutList,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  Archive,
  Tag,
  FolderInput,
  ChevronLeft,
  ChevronRight,
  Package,
  Bookmark,
  Save,
  Trash2,
  Plus,
  ListPlus,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { useItems } from "@/hooks/useItems"
import { useTags, type TagResponse } from "@/hooks/useTags"
import { useSavedViews, useCreateSavedView, useDeleteSavedView } from "@/hooks/useSavedViews"
import type { SavedViewResponse } from "@/hooks/useSavedViews"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { MoveItemsDialog } from "@/components/MoveItemsDialog"
import { useAddToLabelQueue } from "@/hooks/useLabelQueue"
import type { ItemResponse, ItemType } from "@/types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

const ITEM_TYPES: ItemType[] = [
  "Consumable",
  "Equipment",
  "Component",
  "Tool",
  "Container",
  "Kit",
  "Documented_Reference",
]

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

interface Filters {
  search: string
  item_type: string
  location: string
  tag: string
  selected_tag_ids: string[]
  tag_mode: "and" | "or"
  quantity: "all" | "low" | "zero" | "has_stock"
  has_photo: "all" | "yes" | "no"
  maintenance_due: "all" | "yes"
}

const DEFAULT_FILTERS: Filters = {
  search: "",
  item_type: "",
  location: "",
  tag: "",
  selected_tag_ids: [],
  tag_mode: "or",
  quantity: "all",
  has_photo: "all",
  maintenance_due: "all",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function isMaintenanceDue(item: ItemResponse): boolean {
  const now = Date.now()
  const threshold = 30 * 24 * 60 * 60 * 1000
  for (const d of [item.maintenance_due_date, item.calibration_due_date]) {
    if (d) {
      const diff = new Date(d).getTime() - now
      if (diff <= threshold) return true
    }
  }
  return false
}

function applyClientFilters(items: ItemResponse[], filters: Filters): ItemResponse[] {
  let result = items

  if (filters.search) {
    const q = filters.search.toLowerCase()
    result = result.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        i.brand?.toLowerCase().includes(q) ||
        i.model_number?.toLowerCase().includes(q)
    )
  }

  if (filters.item_type) {
    result = result.filter((i) => i.item_type === filters.item_type)
  }

  if (filters.location) {
    const q = filters.location.toLowerCase()
    result = result.filter((i) =>
      i.current_placement?.location_name?.toLowerCase().includes(q) ||
      i.current_placement?.container_name?.toLowerCase().includes(q)
    )
  }

  if (filters.tag) {
    const q = filters.tag.toLowerCase()
    result = result.filter((i) =>
      i.tags.some((t) => t.name.toLowerCase().includes(q))
    )
  }

  if (filters.selected_tag_ids.length > 0) {
    if (filters.tag_mode === "and") {
      result = result.filter((i) =>
        filters.selected_tag_ids.every((tid) => i.tags.some((t) => t.id === tid))
      )
    } else {
      result = result.filter((i) =>
        filters.selected_tag_ids.some((tid) => i.tags.some((t) => t.id === tid))
      )
    }
  }

  if (filters.quantity === "low") {
    result = result.filter(
      (i) =>
        i.quantity_on_hand != null &&
        i.minimum_quantity != null &&
        i.quantity_on_hand < i.minimum_quantity
    )
  } else if (filters.quantity === "zero") {
    result = result.filter((i) => i.quantity_on_hand != null && Number(i.quantity_on_hand) === 0)
  } else if (filters.quantity === "has_stock") {
    result = result.filter((i) => i.quantity_on_hand != null && Number(i.quantity_on_hand) > 0)
  }

  if (filters.has_photo === "yes") {
    result = result.filter((i) => i.primary_photo != null)
  } else if (filters.has_photo === "no") {
    result = result.filter((i) => i.primary_photo == null)
  }

  if (filters.maintenance_due === "yes") {
    result = result.filter(isMaintenanceDue)
  }

  return result
}

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

function buildColumns(
  onSelectAll: (checked: boolean) => void,
  allSelected: boolean,
  someSelected: boolean
): ColumnDef<ItemResponse>[] {
  return [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={allSelected}
          onCheckedChange={onSelectAll}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label={`Select ${row.original.name}`}
        />
      ),
      enableSorting: false,
      size: 40,
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.code}</p>
        </div>
      ),
    },
    {
      accessorKey: "item_type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline" className="whitespace-nowrap">
          {row.original.item_type.replace("_", " ")}
        </Badge>
      ),
    },
    {
      id: "category",
      header: "Category",
      accessorFn: (row) => row.categories?.map((c) => c.name).join(", ") ?? "",
      cell: ({ row }) => {
        const cats = row.original.categories ?? []
        return cats.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {cats.map((c) => (
              <Badge key={c.id} variant="secondary" className="text-xs">{c.name}</Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )
      },
    },
    {
      id: "location",
      header: "Location",
      accessorFn: (row) => row.current_placement?.location_name ?? row.current_placement?.container_name ?? "",
      cell: ({ row }) => {
        const p = row.original.current_placement
        const loc = p?.location_name || p?.container_name
        return loc ? (
          <span className="text-sm">{loc}</span>
        ) : (
          <span className="text-sm text-muted-foreground">Unassigned</span>
        )
      },
    },
    {
      accessorKey: "quantity_on_hand",
      header: "Qty",
      cell: ({ row }) => {
        const qty = row.original.quantity_on_hand
        const min = row.original.minimum_quantity
        const isLow = qty != null && min != null && qty < min
        return (
          <span className={cn("text-sm", isLow && "text-destructive font-medium")}>
            {qty != null ? Number(qty) : "—"}
          </span>
        )
      },
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(row.original.updated_at)}
        </span>
      ),
    },
  ]
}

// ---------------------------------------------------------------------------
// Preset saved views (client-side only, not persisted to DB)
// ---------------------------------------------------------------------------

interface PresetView {
  name: string
  filters: Partial<Filters>
}

const PRESET_VIEWS: PresetView[] = [
  { name: "Low Stock", filters: { quantity: "low" } },
  { name: "No Photo", filters: { has_photo: "no" } },
  { name: "Unsorted Items", filters: { location: "" } },
  { name: "Needs Maintenance", filters: { maintenance_due: "yes" } },
]

// ---------------------------------------------------------------------------
// Saved Views Panel
// ---------------------------------------------------------------------------

function SavedViewsPanel({
  filters,
  onApply,
}: {
  filters: Filters
  onApply: (f: Filters) => void
}) {
  const [saveName, setSaveName] = useState("")
  const [showSaveInput, setShowSaveInput] = useState(false)

  const { data: savedViews = [] } = useSavedViews()
  const createView = useCreateSavedView()
  const deleteView = useDeleteSavedView()

  const handleSave = () => {
    const trimmed = saveName.trim()
    if (!trimmed) return
    createView.mutate(
      { name: trimmed, entity_type: "item", filter_json: filters as unknown as Record<string, unknown> },
      {
        onSuccess: () => {
          setSaveName("")
          setShowSaveInput(false)
        },
      }
    )
  }

  const handleLoadView = (view: SavedViewResponse) => {
    if (view.filter_json) {
      onApply({ ...DEFAULT_FILTERS, ...(view.filter_json as unknown as Partial<Filters>) })
    }
  }

  const handleLoadPreset = (preset: PresetView) => {
    onApply({ ...DEFAULT_FILTERS, ...preset.filters })
  }

  const hasNonDefaultFilters = Object.entries(filters).some(([k, v]) => {
    return v !== DEFAULT_FILTERS[k as keyof Filters]
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Bookmark className="h-3.5 w-3.5" />
          Saved Views
        </h3>
      </div>

      {/* Preset views */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Presets</p>
        {PRESET_VIEWS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => handleLoadPreset(preset)}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-muted min-h-[44px] sm:min-h-0"
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* User saved views */}
      {savedViews.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">My Views</p>
          {savedViews.map((view) => (
            <div
              key={view.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted min-h-[44px] sm:min-h-0"
            >
              <button
                onClick={() => handleLoadView(view)}
                className="flex-1 text-left text-sm truncate"
              >
                {view.name}
              </button>
              <button
                onClick={() => deleteView.mutate(view.id)}
                className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${view.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Save current filters */}
      {showSaveInput ? (
        <div className="space-y-2">
          <Input
            placeholder="View name..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave()
              if (e.key === "Escape") setShowSaveInput(false)
            }}
            autoFocus
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!saveName.trim() || createView.isPending}>
              <Save className="mr-1 h-3 w-3" />
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowSaveInput(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => setShowSaveInput(true)}
          disabled={!hasNonDefaultFilters}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save Current Filters
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filter Sidebar
// ---------------------------------------------------------------------------

function FilterSidebar({
  filters,
  onChange,
  onReset,
}: {
  filters: Filters
  onChange: (f: Partial<Filters>) => void
  onReset: () => void
}) {
  const { data: allTags = [] } = useTags()
  const hasActiveFilters = Object.entries(filters).some(([k, v]) => {
    const def = DEFAULT_FILTERS[k as keyof Filters]
    if (k === "selected_tag_ids") return (v as string[]).length > 0
    return v !== def
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Item Type</label>
          <select
            value={filters.item_type}
            onChange={(e) => onChange({ item_type: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">All types</option>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Location</label>
          <Input
            placeholder="Filter by location..."
            value={filters.location}
            onChange={(e) => onChange({ location: e.target.value })}
            className="mt-1 h-8 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Tag</label>
          <Input
            placeholder="Filter by tag..."
            value={filters.tag}
            onChange={(e) => onChange({ tag: e.target.value })}
            className="mt-1 h-8 text-sm"
          />
          {allTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {allTags.map((t) => {
                const active = filters.selected_tag_ids.includes(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() =>
                      onChange({
                        selected_tag_ids: active
                          ? filters.selected_tag_ids.filter((id) => id !== t.id)
                          : [...filters.selected_tag_ids, t.id],
                      })
                    }
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
                  </button>
                )
              })}
            </div>
          )}
          {filters.selected_tag_ids.length > 1 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Match:</span>
              <button
                onClick={() => onChange({ tag_mode: "or" })}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded",
                  filters.tag_mode === "or" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                Any
              </button>
              <button
                onClick={() => onChange({ tag_mode: "and" })}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded",
                  filters.tag_mode === "and" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                All
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Quantity</label>
          <select
            value={filters.quantity}
            onChange={(e) => onChange({ quantity: e.target.value as Filters["quantity"] })}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="low">Low stock</option>
            <option value="zero">Zero stock</option>
            <option value="has_stock">Has stock</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Has Photo</label>
          <select
            value={filters.has_photo}
            onChange={(e) => onChange({ has_photo: e.target.value as Filters["has_photo"] })}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="yes">With photo</option>
            <option value="no">Without photo</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Maintenance Due</label>
          <select
            value={filters.maintenance_due}
            onChange={(e) =>
              onChange({ maintenance_due: e.target.value as Filters["maintenance_due"] })
            }
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="yes">Due / overdue</option>
          </select>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

function ItemGridCard({
  item,
  selected,
  onSelect,
}: {
  item: ItemResponse
  selected: boolean
  onSelect: (v: boolean) => void
}) {
  return (
    <Link to={`/items/${item.id}`} className="block">
      <Card className={cn("transition-colors hover:bg-muted/30", selected && "ring-2 ring-primary")}>
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <div onClick={(e) => e.preventDefault()}>
              <Checkbox checked={selected} onCheckedChange={onSelect} aria-label={`Select ${item.name}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.code}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-xs">
              {item.item_type.replace("_", " ")}
            </Badge>
            {(item.current_placement?.location_name || item.current_placement?.container_name) && (
              <Badge variant="secondary" className="text-xs">
                {item.current_placement.location_name || item.current_placement.container_name}
              </Badge>
            )}
          </div>
          {item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.tags.slice(0, 3).map((t) => (
                <span
                  key={t.id}
                  className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs"
                >
                  {t.name}
                </span>
              ))}
              {item.tags.length > 3 && (
                <span className="text-xs text-muted-foreground">+{item.tags.length - 3}</span>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Qty: {item.quantity_on_hand != null ? Number(item.quantity_on_hand) : "—"}</span>
            <span>{formatDate(item.updated_at)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Bulk Actions Bar
// ---------------------------------------------------------------------------

function BulkActionsBar({
  count,
  onArchive,
  onTag,
  onMove,
  onAddToQueue,
  addingToQueue,
  onClear,
}: {
  count: number
  onArchive: () => void
  onTag: () => void
  onMove: () => void
  onAddToQueue: () => void
  addingToQueue?: boolean
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="ml-2 flex gap-1">
        <Button variant="outline" size="sm" onClick={onArchive}>
          <Archive className="mr-1.5 h-3.5 w-3.5" />
          Archive
        </Button>
        <Button variant="outline" size="sm" onClick={onTag}>
          <Tag className="mr-1.5 h-3.5 w-3.5" />
          Tag
        </Button>
        <Button variant="outline" size="sm" onClick={onMove}>
          <FolderInput className="mr-1.5 h-3.5 w-3.5" />
          Move
        </Button>
        <Button variant="outline" size="sm" onClick={onAddToQueue} disabled={addingToQueue}>
          <ListPlus className="mr-1.5 h-3.5 w-3.5" />
          Label Queue
        </Button>
      </div>
      <button onClick={onClear} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
        Clear
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {total} item{total !== 1 ? "s" : ""} total
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sort header helper
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  column,
}: {
  label: string
  column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc?: boolean) => void }
}) {
  const sorted = column.getIsSorted()
  return (
    <button
      className="flex items-center gap-1 hover:text-foreground"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <ChevronUp className="h-3.5 w-3.5" />
      ) : sorted === "desc" ? (
        <ChevronDown className="h-3.5 w-3.5" />
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Items() {
  // State
  const [page, setPage] = useState(1)
  const [view, setView] = useState<"table" | "grid">("table")
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // Data
  const { data, isLoading, isError } = useItems({ page, pageSize: PAGE_SIZE })
  const allItems = data?.items ?? []
  const total = data?.total ?? 0

  // Client-side filtering
  const filteredItems = useMemo(() => applyClientFilters(allItems, filters), [allItems, filters])

  // Selection helpers
  const allSelected = filteredItems.length > 0 && Object.keys(rowSelection).length === filteredItems.length
  const someSelected = Object.keys(rowSelection).length > 0

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const sel: RowSelectionState = {}
        filteredItems.forEach((_, i) => {
          sel[i] = true
        })
        setRowSelection(sel)
      } else {
        setRowSelection({})
      }
    },
    [filteredItems]
  )

  const columns = useMemo(
    () => buildColumns(handleSelectAll, allSelected, someSelected),
    [handleSelectAll, allSelected, someSelected]
  )

  // Table instance
  const table = useReactTable({
    data: filteredItems,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  })

  const selectedCount = Object.keys(rowSelection).length
  const selectedIds = Object.keys(rowSelection).map((i) => filteredItems[Number(i)]?.id).filter(Boolean)

  // Filter change handler
  const handleFilterChange = (partial: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
    setPage(1)
  }

  // Move dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const addToQueue = useAddToLabelQueue()

  // Bulk action stubs
  const handleBulkArchive = () => {
    // TODO: wire to API
    console.log("Archive items:", selectedIds)
  }
  const handleBulkTag = () => {
    // TODO: wire to API
    console.log("Tag items:", selectedIds)
  }
  const handleBulkMove = () => {
    setMoveDialogOpen(true)
  }
  const handleBulkAddToQueue = () => {
    addToQueue.mutate(selectedIds.map((id) => ({ entity_type: "item" as const, entity_id: id })))
  }

  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Items</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Browse and manage your inventory items.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Add New */}
          <Button size="sm" asChild>
            <Link to="/items/new"><Plus className="mr-1.5 h-4 w-4" />Add New</Link>
          </Button>
          {/* Search */}
          <Input
            placeholder="Search items..."
            value={filters.search}
            onChange={(e) => handleFilterChange({ search: e.target.value })}
            className="h-9 w-48 lg:w-64"
          />
          {/* Filter toggle */}
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="mr-1.5 h-4 w-4" />
            Filters
          </Button>
          {/* View toggle */}
          <div className="flex rounded-md border">
            <button
              className={cn(
                "px-2.5 py-1.5 text-sm min-h-[44px] min-w-[44px] flex items-center justify-center",
                view === "table" ? "bg-muted" : "hover:bg-muted/50"
              )}
              onClick={() => setView("table")}
              aria-label="Table view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              className={cn(
                "px-2.5 py-1.5 text-sm min-h-[44px] min-w-[44px] flex items-center justify-center",
                view === "grid" ? "bg-muted" : "hover:bg-muted/50"
              )}
              onClick={() => setView("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedCount > 0 && (
        <BulkActionsBar
          count={selectedCount}
          onArchive={handleBulkArchive}
          onTag={handleBulkTag}
          onMove={handleBulkMove}
          onAddToQueue={handleBulkAddToQueue}
          addingToQueue={addToQueue.isPending}
          onClear={() => setRowSelection({})}
        />
      )}

      {/* Content area */}
      <div className={cn("flex gap-4", showFilters ? "" : "")}>
        {/* Filter sidebar */}
        {showFilters && (
          <div className="hidden w-56 shrink-0 rounded-lg border bg-card p-4 lg:block space-y-4">
            <SavedViewsPanel filters={filters} onApply={(f) => { setFilters(f); setPage(1) }} />
            <Separator />
            <FilterSidebar
              filters={filters}
              onChange={handleFilterChange}
              onReset={() => {
                setFilters(DEFAULT_FILTERS)
                setPage(1)
              }}
            />
          </div>
        )}

        {/* Mobile filter sheet - simplified inline */}
        {showFilters && (
          <div className="mb-4 rounded-lg border bg-card p-4 lg:hidden space-y-4">
            <SavedViewsPanel filters={filters} onApply={(f) => { setFilters(f); setPage(1) }} />
            <Separator />
            <FilterSidebar
              filters={filters}
              onChange={handleFilterChange}
              onReset={() => {
                setFilters(DEFAULT_FILTERS)
                setPage(1)
              }}
            />
          </div>
        )}

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Loading */}
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {/* Error */}
          {isError && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-destructive">
                Failed to load items. Please try again.
              </CardContent>
            </Card>
          )}

          {/* Empty */}
          {!isLoading && !isError && filteredItems.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12">
                <Package className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {allItems.length === 0 ? "No items yet." : "No items match your filters."}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Table view */}
          {!isLoading && !isError && filteredItems.length > 0 && view === "table" && (
            <div className="-mx-4 overflow-x-auto sm:mx-0 rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b bg-muted/50">
                      {hg.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-3 py-2 text-left font-medium text-muted-foreground"
                          style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                        >
                          {header.isPlaceholder ? null : header.column.getCanSort() ? (
                            <SortableHeader
                              label={flexRender(header.column.columnDef.header, header.getContext()) as string}
                              column={header.column}
                            />
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b transition-colors hover:bg-muted/30 cursor-pointer",
                        row.getIsSelected() && "bg-muted/50"
                      )}
                      onClick={(e) => {
                        // Don't navigate if clicking checkbox
                        if ((e.target as HTMLElement).closest('[role="checkbox"]')) return
                        navigate(`/items/${row.original.id}`)
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Grid view */}
          {!isLoading && !isError && filteredItems.length > 0 && view === "grid" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map((item, idx) => (
                <ItemGridCard
                  key={item.id}
                  item={item}
                  selected={!!rowSelection[idx]}
                  onSelect={(v) =>
                    setRowSelection((prev) => {
                      const next = { ...prev }
                      if (v) next[idx] = true
                      else delete next[idx]
                      return next
                    })
                  }
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && !isError && total > 0 && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>

      {/* Move dialog */}
      <MoveItemsDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        itemIds={selectedIds}
        onSuccess={() => setRowSelection({})}
      />
    </div>
  )
}
