import { useState, useMemo, useCallback } from "react"
import { Link } from "react-router-dom"
import {
  Search,
  Filter,
  X,
  Package,
  MapPin,
  Tag,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react"
import { useAdvancedSearch, type AdvancedSearchFilters, type AdvancedSearchResponse } from "@/hooks/useAdvancedSearch"
import { useCategories } from "@/hooks/useCategories"
import { useTags } from "@/hooks/useTags"
import { useLocations } from "@/hooks/useLocations"
import { useDebounce } from "@/hooks/useDebounce"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

const ITEM_TYPES = [
  "Consumable",
  "Equipment",
  "Component",
  "Tool",
  "Container",
  "Kit",
  "Documented_Reference",
] as const

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

interface FilterState {
  query: string
  category_id: string
  item_type: string
  location_id: string
  tag_ids: string[]
  min_quantity: string
  max_quantity: string
  has_photo: "all" | "yes" | "no"
  maintenance_due: boolean
}

const DEFAULT_FILTERS: FilterState = {
  query: "",
  category_id: "",
  item_type: "",
  location_id: "",
  tag_ids: [],
  min_quantity: "",
  max_quantity: "",
  has_photo: "all",
  maintenance_due: false,
}

function filtersToRequest(f: FilterState, page: number): AdvancedSearchFilters {
  const req: AdvancedSearchFilters = {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }
  if (f.query.trim()) req.query = f.query.trim()
  if (f.category_id) req.category_id = f.category_id
  if (f.item_type) req.item_type = f.item_type
  if (f.location_id) req.location_id = f.location_id
  if (f.tag_ids.length > 0) req.tag_ids = f.tag_ids
  if (f.min_quantity) req.min_quantity = Number(f.min_quantity)
  if (f.max_quantity) req.max_quantity = Number(f.max_quantity)
  if (f.has_photo === "yes") req.has_photo = true
  else if (f.has_photo === "no") req.has_photo = false
  if (f.maintenance_due) req.maintenance_due = true
  return req
}

function hasActiveFilters(f: FilterState): boolean {
  return (
    f.category_id !== "" ||
    f.item_type !== "" ||
    f.location_id !== "" ||
    f.tag_ids.length > 0 ||
    f.min_quantity !== "" ||
    f.max_quantity !== "" ||
    f.has_photo !== "all" ||
    f.maintenance_due
  )
}

// ---------------------------------------------------------------------------
// FilterSidebar
// ---------------------------------------------------------------------------

function FilterSidebar({
  filters,
  onChange,
  onReset,
}: {
  filters: FilterState
  onChange: (partial: Partial<FilterState>) => void
  onReset: () => void
}) {
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useTags()
  const { data: locationData } = useLocations({ rootOnly: false })
  const locations = locationData?.locations ?? []

  const toggleTag = useCallback(
    (tagId: string) => {
      onChange({
        tag_ids: filters.tag_ids.includes(tagId)
          ? filters.tag_ids.filter((id) => id !== tagId)
          : [...filters.tag_ids, tagId],
      })
    },
    [filters.tag_ids, onChange]
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </h3>
        {hasActiveFilters(filters) && (
          <button
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset all
          </button>
        )}
      </div>

      {/* Category */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Category</label>
        <select
          value={filters.category_id}
          onChange={(e) => onChange({ category_id: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Item Type */}
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

      {/* Location subtree */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Location</label>
        <select
          value={filters.location_id}
          onChange={(e) => onChange({ location_id: e.target.value })}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.path_text || l.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tags multi-select */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Tags</label>
        <div className="mt-1 max-h-40 overflow-y-auto space-y-1 rounded-md border border-input p-2">
          {tags.length === 0 && (
            <p className="text-xs text-muted-foreground">No tags available</p>
          )}
          {tags.map((tag) => (
            <label
              key={tag.id}
              className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50 min-h-[32px]"
            >
              <Checkbox
                checked={filters.tag_ids.includes(tag.id)}
                onCheckedChange={() => toggleTag(tag.id)}
              />
              <span className="text-sm">{tag.name}</span>
              {tag.color && (
                <span
                  className="ml-auto h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
              )}
            </label>
          ))}
        </div>
        {filters.tag_ids.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {filters.tag_ids.map((id) => {
              const tag = tags.find((t) => t.id === id)
              return tag ? (
                <Badge
                  key={id}
                  variant="secondary"
                  className="text-xs cursor-pointer"
                  onClick={() => toggleTag(id)}
                >
                  {tag.name}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ) : null
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* Quantity range */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Quantity Range</label>
        <div className="mt-1 flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.min_quantity}
            onChange={(e) => onChange({ min_quantity: e.target.value })}
            className="h-8 text-sm"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="number"
            placeholder="Max"
            value={filters.max_quantity}
            onChange={(e) => onChange({ max_quantity: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Has Photo */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Has Photo</label>
        <select
          value={filters.has_photo}
          onChange={(e) => onChange({ has_photo: e.target.value as FilterState["has_photo"] })}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          <option value="yes">With photo</option>
          <option value="no">Without photo</option>
        </select>
      </div>

      {/* Maintenance Due */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer min-h-[36px]">
          <Checkbox
            checked={filters.maintenance_due}
            onCheckedChange={(v) => onChange({ maintenance_due: !!v })}
          />
          <span className="text-sm">Maintenance due</span>
        </label>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SearchResults
// ---------------------------------------------------------------------------

function SearchResults({
  items,
  total,
  isLoading,
  isError,
}: {
  items: AdvancedSearchResponse["items"]
  total: number
  isLoading: boolean
  isError: boolean
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          Search failed. Please try again.
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12">
          <Search className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No results found. Try adjusting your filters.</p>
        </CardContent>
      </Card>
    )
  }

  // Group by entity type
  const regularItems = items.filter((i) => !i.is_container)
  const containers = items.filter((i) => i.is_container)

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {total} result{total !== 1 ? "s" : ""} found
      </p>

      {regularItems.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Package className="h-4 w-4" />
            Items ({regularItems.length})
          </h3>
          <div className="space-y-2">
            {regularItems.map((item) => (
              <SearchResultCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {containers.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            Containers ({containers.length})
          </h3>
          <div className="space-y-2">
            {containers.map((item) => (
              <SearchResultCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SearchResultCard({
  item,
}: {
  item: AdvancedSearchResponse["items"][number]
}) {
  return (
    <Link to={`/items/${item.id}`}>
      <Card className="transition-colors hover:bg-muted/30">
        <CardContent className="flex items-center gap-3 p-3">
          <Package className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <Badge variant="outline" className="text-xs shrink-0">
                {item.item_type.replace("_", " ")}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{item.code}</span>
              {item.brand && (
                <span className="text-xs text-muted-foreground">· {item.brand}</span>
              )}
              {item.model_number && (
                <span className="text-xs text-muted-foreground">· {item.model_number}</span>
              )}
            </div>
          </div>
          {item.tags.length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1 shrink-0 max-w-48">
              {item.tags.slice(0, 3).map((t) => (
                <Badge key={t.id} variant="secondary" className="text-xs">
                  {t.name}
                </Badge>
              ))}
              {item.tags.length > 3 && (
                <span className="text-xs text-muted-foreground">+{item.tags.length - 3}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function SearchPagination({
  page,
  total,
  onPageChange,
}: {
  page: number
  total: number
  onPageChange: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
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
// Main Page
// ---------------------------------------------------------------------------

export default function SearchPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(true)

  const debouncedQuery = useDebounce(filters.query, 300)

  const requestFilters = useMemo(
    () => filtersToRequest({ ...filters, query: debouncedQuery }, page),
    [filters, debouncedQuery, page]
  )

  // Only search when there's a query or at least one filter active
  const shouldSearch = debouncedQuery.trim().length > 0 || hasActiveFilters(filters)

  const { data, isLoading, isError } = useAdvancedSearch(requestFilters, shouldSearch)

  const handleFilterChange = useCallback((partial: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
    setPage(1)
  }, [])

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Advanced Search</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Search and filter across your entire inventory.
          </p>
        </div>
        <Button
          variant={showFilters ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="self-start sm:self-auto"
        >
          <Filter className="mr-1.5 h-4 w-4" />
          Filters
        </Button>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search items by name, brand, model, part number..."
          value={filters.query}
          onChange={(e) => handleFilterChange({ query: e.target.value })}
          className="pl-10 h-10"
        />
        {filters.query && (
          <button
            onClick={() => handleFilterChange({ query: "" })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {hasActiveFilters(filters) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {filters.category_id && (
            <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => handleFilterChange({ category_id: "" })}>
              Category <X className="ml-1 h-3 w-3" />
            </Badge>
          )}
          {filters.item_type && (
            <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => handleFilterChange({ item_type: "" })}>
              {filters.item_type.replace("_", " ")} <X className="ml-1 h-3 w-3" />
            </Badge>
          )}
          {filters.location_id && (
            <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => handleFilterChange({ location_id: "" })}>
              Location <X className="ml-1 h-3 w-3" />
            </Badge>
          )}
          {filters.tag_ids.length > 0 && (
            <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => handleFilterChange({ tag_ids: [] })}>
              {filters.tag_ids.length} tag{filters.tag_ids.length > 1 ? "s" : ""} <X className="ml-1 h-3 w-3" />
            </Badge>
          )}
          {(filters.min_quantity || filters.max_quantity) && (
            <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => handleFilterChange({ min_quantity: "", max_quantity: "" })}>
              Qty range <X className="ml-1 h-3 w-3" />
            </Badge>
          )}
          {filters.has_photo !== "all" && (
            <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => handleFilterChange({ has_photo: "all" })}>
              {filters.has_photo === "yes" ? "Has photo" : "No photo"} <X className="ml-1 h-3 w-3" />
            </Badge>
          )}
          {filters.maintenance_due && (
            <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => handleFilterChange({ maintenance_due: false })}>
              Maintenance due <X className="ml-1 h-3 w-3" />
            </Badge>
          )}
          <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground ml-1">
            Clear all
          </button>
        </div>
      )}

      {/* Content */}
      <div className={cn("flex gap-4")}>
        {/* Filter sidebar */}
        {showFilters && (
          <div className="hidden w-60 shrink-0 rounded-lg border bg-card p-4 lg:block overflow-y-auto max-h-[calc(100vh-16rem)]">
            <FilterSidebar
              filters={filters}
              onChange={handleFilterChange}
              onReset={handleReset}
            />
          </div>
        )}

        {/* Mobile filters */}
        {showFilters && (
          <div className="mb-4 w-full rounded-lg border bg-card p-4 lg:hidden">
            <FilterSidebar
              filters={filters}
              onChange={handleFilterChange}
              onReset={handleReset}
            />
          </div>
        )}

        {/* Results */}
        <div className="min-w-0 flex-1 space-y-4">
          {!shouldSearch && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12">
                <Search className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Enter a search term or apply filters to find items.
                </p>
              </CardContent>
            </Card>
          )}

          {shouldSearch && (
            <>
              <SearchResults
                items={data?.items ?? []}
                total={data?.total ?? 0}
                isLoading={isLoading}
                isError={isError}
              />
              <SearchPagination
                page={page}
                total={data?.total ?? 0}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
