import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search, Loader2, Package, MapPin, Box, Tag } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useDebounce } from "@/hooks/useDebounce"
import { useSearch, type GlobalSearchResponse } from "@/hooks/useSearch"
import { cn } from "@/lib/utils"

interface FlatResult {
  type: string
  id: string
  name: string
  detail: string
}

function flattenResults(data: GlobalSearchResponse | undefined): FlatResult[] {
  if (!data) return []
  const results: FlatResult[] = []
  data.items.forEach((i) => results.push({ type: "item", id: i.id, name: i.name, detail: i.item_type }))
  data.containers.forEach((c) => results.push({ type: "container", id: c.id, name: c.name, detail: "Container" }))
  data.locations.forEach((l) => results.push({ type: "location", id: l.id, name: l.name, detail: l.path_text ?? "" }))
  data.tags.forEach((t) => results.push({ type: "tag", id: t.id, name: t.name, detail: t.slug }))
  return results
}

export function GlobalSearchBar() {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const debouncedQuery = useDebounce(query, 300)
  const { data, isLoading } = useSearch(debouncedQuery)
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const flatResults = flattenResults(data)

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1)
  }, [data])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const handleSelect = useCallback(
    (type: string, id: string) => {
      setOpen(false)
      setQuery("")
      setActiveIndex(-1)
      switch (type) {
        case "item":
        case "container":
          navigate(`/items/${id}`)
          break
        case "location":
          navigate(`/locations/${id}`)
          break
        case "tag":
          navigate(`/items?tag=${id}`)
          break
      }
    },
    [navigate]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false)
      setActiveIndex(-1)
      inputRef.current?.blur()
      return
    }

    if (!open || flatResults.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((prev) => (prev < flatResults.length - 1 ? prev + 1 : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatResults.length - 1))
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault()
      const item = flatResults[activeIndex]
      if (item) handleSelect(item.type, item.id)
    }
  }

  const hasResults =
    data &&
    (data.items.length > 0 ||
      data.containers.length > 0 ||
      data.locations.length > 0 ||
      data.tags.length > 0)

  const showDropdown = open && debouncedQuery.length >= 2

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      {isLoading && debouncedQuery.length >= 2 && (
        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
      )}
      <Input
        ref={inputRef}
        type="search"
        placeholder="Search inventory..."
        className="pl-8 w-[200px] lg:w-[300px]"
        aria-label="Search inventory"
        aria-expanded={showDropdown}
        aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
        role="combobox"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (query.length >= 2) setOpen(true)
        }}
        onKeyDown={handleKeyDown}
      />

      {showDropdown && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-[320px] max-h-[400px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
          role="listbox"
        >
          {isLoading && !data && (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching...
            </div>
          )}

          {!isLoading && !hasResults && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No results found
            </div>
          )}

          {data && hasResults && (
            <SearchResults
              data={data}
              onSelect={handleSelect}
              activeIndex={activeIndex}
              flatResults={flatResults}
            />
          )}
        </div>
      )}
    </div>
  )
}

function SearchResults({
  data,
  onSelect,
  activeIndex,
  flatResults,
}: {
  data: GlobalSearchResponse
  onSelect: (type: string, id: string) => void
  activeIndex: number
  flatResults: FlatResult[]
}) {
  return (
    <>
      {data.items.length > 0 && (
        <ResultGroup
          label="Items"
          icon={<Package className="h-4 w-4" />}
          items={data.items.map((i) => ({
            id: i.id,
            name: i.name,
            detail: i.item_type,
          }))}
          onSelect={(id) => onSelect("item", id)}
          activeIndex={activeIndex}
          flatResults={flatResults}
          groupType="item"
        />
      )}
      {data.containers.length > 0 && (
        <ResultGroup
          label="Containers"
          icon={<Box className="h-4 w-4" />}
          items={data.containers.map((c) => ({
            id: c.id,
            name: c.name,
            detail: "Container",
          }))}
          onSelect={(id) => onSelect("container", id)}
          activeIndex={activeIndex}
          flatResults={flatResults}
          groupType="container"
        />
      )}
      {data.locations.length > 0 && (
        <ResultGroup
          label="Locations"
          icon={<MapPin className="h-4 w-4" />}
          items={data.locations.map((l) => ({
            id: l.id,
            name: l.name,
            detail: l.path_text ?? "",
          }))}
          onSelect={(id) => onSelect("location", id)}
          activeIndex={activeIndex}
          flatResults={flatResults}
          groupType="location"
        />
      )}
      {data.tags.length > 0 && (
        <ResultGroup
          label="Tags"
          icon={<Tag className="h-4 w-4" />}
          items={data.tags.map((t) => ({
            id: t.id,
            name: t.name,
            detail: t.slug,
          }))}
          onSelect={(id) => onSelect("tag", id)}
          activeIndex={activeIndex}
          flatResults={flatResults}
          groupType="tag"
        />
      )}
    </>
  )
}

function ResultGroup({
  label,
  icon,
  items,
  onSelect,
  activeIndex,
  flatResults,
  groupType,
}: {
  label: string
  icon: React.ReactNode
  items: { id: string; name: string; detail: string }[]
  onSelect: (id: string) => void
  activeIndex: number
  flatResults: FlatResult[]
  groupType: string
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      {items.map((item) => {
        const flatIdx = flatResults.findIndex(
          (r) => r.type === groupType && r.id === item.id
        )
        const isActive = flatIdx === activeIndex
        return (
          <button
            key={item.id}
            id={`search-result-${flatIdx}`}
            role="option"
            aria-selected={isActive}
            className={cn(
              "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm cursor-pointer min-h-[40px]",
              isActive
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => onSelect(item.id)}
          >
            <span className="truncate font-medium">{item.name}</span>
            <span className="ml-2 shrink-0 text-xs text-muted-foreground">
              {item.detail}
            </span>
          </button>
        )
      })}
    </div>
  )
}
