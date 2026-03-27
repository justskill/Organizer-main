import { useState, useMemo, useCallback } from "react"
import {
  QrCode,
  Package,
  MapPin,
  Search,
  Printer,
  Loader2,
  Download,
  AlertCircle,
  Eye,
} from "lucide-react"
import { useItems } from "@/hooks/useItems"
import { useLocations } from "@/hooks/useLocations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select } from "@/components/ui/select"
import type { ItemResponse, LocationResponse } from "@/types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabelEntity {
  id: string
  code: string
  name: string
  entityType: "item" | "location"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = "/api/v1"

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("auth_token")
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function fetchLabelPdf(
  entityType: "item" | "location",
  entityId: string,
  format: "adhesive" | "sheet",
): Promise<string> {
  const res = await fetch(`${API_BASE}/labels/generate`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      entity_type: entityType,
      entity_id: entityId,
      format,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || res.statusText)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

async function fetchSheetPdf(
  entities: LabelEntity[],
  startCell: number,
  labelTemplate: string = "avery5260",
  textScale: number = 1.0,
  footerText: string = "",
): Promise<string> {
  const res = await fetch(`${API_BASE}/labels/generate-sheet`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      entities: entities.map((e) => ({
        entity_type: e.entityType,
        entity_id: e.id,
      })),
      start_cell: startCell,
      label_template: labelTemplate,
      text_scale: textScale,
      footer_text: footerText,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || res.statusText)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

/** Open a blob URL in a new tab for print preview. */
function openPdfPreview(blobUrl: string) {
  window.open(blobUrl, "_blank")
}

/** Trigger a file download from a blob URL. */
function downloadBlobUrl(blobUrl: string, filename: string) {
  const a = document.createElement("a")
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ---------------------------------------------------------------------------
// Template definitions for preview rendering
// ---------------------------------------------------------------------------

const LABEL_TEMPLATES = {
  avery5260: {
    name: 'Avery 5260',
    description: '1" × 2⅝", 30/sheet (3×10)',
    labelW: 2.625,
    labelH: 1.0,
    cols: 3,
    rows: 10,
    maxCells: 30,
  },
  avery18163: {
    name: 'Avery 18163',
    description: '2" × 4", 10/sheet (2×5)',
    labelW: 4.0,
    labelH: 2.0,
    cols: 2,
    rows: 5,
    maxCells: 10,
  },
  avery18294: {
    name: 'Avery 18294',
    description: '⅔" × 1¾", 60/sheet (4×15)',
    labelW: 1.75,
    labelH: 0.667,
    cols: 4,
    rows: 15,
    maxCells: 60,
  },
} as const

type SheetTemplate = keyof typeof LABEL_TEMPLATES

type TextSize = "xs" | "small" | "normal" | "large" | "xl"

// ---------------------------------------------------------------------------
// Single Label Preview (visual mock of what the printed label looks like)
// ---------------------------------------------------------------------------

function SingleLabelPreview({
  entity,
  template,
  textSize,
  footerText,
}: {
  entity: LabelEntity
  template: SheetTemplate
  textSize: TextSize
  footerText?: string
}) {
  const isItem = entity.entityType === "item"
  const Icon = isItem ? Package : MapPin

  // Scale factor for the visual preview box
  const isTiny = template === "avery18294"
  const isLarge = template === "avery18163"
  const previewH = isLarge ? 80 : isTiny ? 36 : 48
  const previewW = isLarge ? 160 : isTiny ? 100 : 126
  const qrSize = isLarge ? 56 : isTiny ? 24 : 32
  const textSizeMap: Record<TextSize, number> = { xs: 0.7, small: 0.85, normal: 1, large: 1.2, xl: 1.45 }
  const scale = textSizeMap[textSize]
  const baseFontLg = isLarge ? 9 : isTiny ? 4.5 : 6
  const baseFontMd = isLarge ? 11 : isTiny ? 5 : 7
  const baseFontSm = isLarge ? 10 : isTiny ? 5 : 7

  return (
    <div
      className="relative rounded border bg-white dark:bg-zinc-900 p-2 flex items-center gap-2"
      style={{ width: previewW, height: previewH }}
    >
      <div
        className="shrink-0 flex items-center justify-center rounded bg-muted"
        style={{ width: qrSize, height: qrSize }}
      >
        <QrCode className="text-muted-foreground" style={{ width: qrSize * 0.6, height: qrSize * 0.6 }} />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        {!isTiny && (
          <div className="flex items-center gap-1">
            <Icon className="shrink-0 text-muted-foreground" style={{ width: 10 * scale, height: 10 * scale }} />
            <span
              className="font-bold uppercase text-muted-foreground truncate"
              style={{ fontSize: `${baseFontLg * scale}px`, lineHeight: 1.2 }}
            >
              {entity.entityType}
            </span>
          </div>
        )}
        <p
          className="truncate font-medium"
          style={{ fontSize: `${baseFontMd * scale}px`, lineHeight: 1.3 }}
        >
          {entity.name}
        </p>
        <p
          className="truncate font-mono text-muted-foreground"
          style={{ fontSize: `${baseFontSm * scale}px`, lineHeight: 1.3 }}
        >
          {entity.code}
        </p>
      </div>
      {footerText && (
        <span
          className="absolute bottom-1 right-1.5 text-muted-foreground truncate"
          style={{ fontSize: `${(isTiny ? 3.5 : isLarge ? 7 : 5) * scale}px`, maxWidth: previewW * 0.55 }}
        >
          {footerText}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sheet Preview (shows grid layout of the selected template)
// ---------------------------------------------------------------------------

function SheetPreview({
  entities,
  template,
  startCell,
  textSize,
}: {
  entities: LabelEntity[]
  template: SheetTemplate
  startCell: number
  textSize: TextSize
}) {
  const tmpl = LABEL_TEMPLATES[template]
  const cells: (LabelEntity | null)[] = []

  // Fill empty cells before startCell
  for (let i = 0; i < startCell - 1 && i < tmpl.maxCells; i++) {
    cells.push(null)
  }
  // Fill with entities (only first page)
  for (let i = 0; i < entities.length && cells.length < tmpl.maxCells; i++) {
    cells.push(entities[i])
  }
  // Fill remaining empty cells
  while (cells.length < tmpl.maxCells) {
    cells.push(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Eye className="h-4 w-4" />
        <span>Sheet preview ({tmpl.name})</span>
      </div>
      <div
        className="rounded-lg border bg-white dark:bg-zinc-950 p-3 overflow-auto"
        style={{ maxHeight: 320 }}
      >
        <div
          className="grid gap-px mx-auto"
          style={{
            gridTemplateColumns: `repeat(${tmpl.cols}, 1fr)`,
            maxWidth: tmpl.cols === 2 ? 340 : tmpl.cols === 4 ? 420 : 400,
          }}
        >
          {cells.map((entity, idx) => (
            <div
              key={idx}
              className={`border rounded flex items-center justify-center ${
                entity ? "bg-card" : "bg-muted/30"
              }`}
              style={{
                aspectRatio: `${tmpl.labelW} / ${tmpl.labelH}`,
                minHeight: template === "avery18163" ? 50 : template === "avery18294" ? 18 : 30,
              }}
            >
              {entity ? (
                <div className="w-full h-full flex items-center gap-1 px-1 overflow-hidden">
                  <QrCode className="shrink-0 text-muted-foreground" style={{ width: template === "avery18294" ? 10 : 14, height: template === "avery18294" ? 10 : 14 }} />
                  <span
                    className="truncate text-foreground"
                    style={{ fontSize: `${template === "avery18163" ? 9 : template === "avery18294" ? 6 : 7}px` }}
                  >
                    {entity.name}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground/40" style={{ fontSize: 8 }}>
                  {idx + 1}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entity Selection List
// ---------------------------------------------------------------------------

function EntitySelectionList({
  entities,
  selected,
  onToggle,
  onToggleAll,
  search,
  onSearchChange,
  isLoading,
  entityType,
}: {
  entities: LabelEntity[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  search: string
  onSearchChange: (v: string) => void
  isLoading: boolean
  entityType: "item" | "location"
}) {
  const filtered = useMemo(() => {
    if (!search) return entities
    const q = search.toLowerCase()
    return entities.filter(
      (e) =>
        e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q)
    )
  }, [entities, search])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((e) => selected.has(e.id))

  const Icon = entityType === "item" ? Package : MapPin

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${entityType}s...`}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 pl-9 text-base"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 px-1">
        <Checkbox
          checked={allFilteredSelected}
          onCheckedChange={onToggleAll}
          aria-label="Select all"
        />
        <span className="text-sm text-muted-foreground">
          {allFilteredSelected ? "Deselect all" : "Select all"}
          {filtered.length !== entities.length && ` (${filtered.length} shown)`}
        </span>
        {selected.size > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {selected.size} selected
          </Badge>
        )}
      </div>

      <div className="max-h-[400px] space-y-1 overflow-y-auto rounded-md border p-1">
        {isLoading && (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Icon className="h-8 w-8" />
            <p className="text-sm">
              {entities.length === 0
                ? `No ${entityType}s found.`
                : `No ${entityType}s match your search.`}
            </p>
          </div>
        )}

        {!isLoading &&
          filtered.map((entity) => (
            <label
              key={entity.id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 min-h-[44px]"
            >
              <Checkbox
                checked={selected.has(entity.id)}
                onCheckedChange={() => onToggle(entity.id)}
                aria-label={`Select ${entity.name}`}
              />
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entity.name}</p>
              </div>
              <span className="text-xs text-muted-foreground font-mono shrink-0">
                {entity.code}
              </span>
            </label>
          ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Label Center Page
// ---------------------------------------------------------------------------

export default function Labels() {
  const [tab, setTab] = useState("items")
  const [itemSearch, setItemSearch] = useState("")
  const [locationSearch, setLocationSearch] = useState("")
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set())
  const [labelFormat, setLabelFormat] = useState<"adhesive" | "sheet" | "avery5260" | "avery18163" | "avery18294">("avery5260")
  const [startCell, setStartCell] = useState(1)
  const [textSize, setTextSize] = useState<TextSize>("normal")
  const [footerText] = useState(() => localStorage.getItem("label_footer_text") ?? "")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCount, setSuccessCount] = useState<number | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  // Fetch data
  const { data: itemsData, isLoading: itemsLoading } = useItems({ pageSize: 200 })
  const { data: locationsData, isLoading: locationsLoading } = useLocations({ pageSize: 200 })

  // Map to LabelEntity
  const itemEntities: LabelEntity[] = useMemo(
    () =>
      (itemsData?.items ?? []).map((item: ItemResponse) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        entityType: "item" as const,
      })),
    [itemsData]
  )

  const locationEntities: LabelEntity[] = useMemo(
    () =>
      (locationsData?.locations ?? []).map((loc: LocationResponse) => ({
        id: loc.id,
        code: loc.code,
        name: loc.name,
        entityType: "location" as const,
      })),
    [locationsData]
  )

  // Selection handlers
  const toggleItem = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSuccessCount(null)
  }, [])

  const toggleLocation = useCallback((id: string) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSuccessCount(null)
  }, [])

  const toggleAllItems = useCallback(() => {
    const q = itemSearch.toLowerCase()
    const filtered = q
      ? itemEntities.filter(
          (e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q)
        )
      : itemEntities
    setSelectedItems((prev) => {
      const allSelected = filtered.every((e) => prev.has(e.id))
      if (allSelected) {
        const next = new Set(prev)
        filtered.forEach((e) => next.delete(e.id))
        return next
      } else {
        const next = new Set(prev)
        filtered.forEach((e) => next.add(e.id))
        return next
      }
    })
    setSuccessCount(null)
  }, [itemEntities, itemSearch])

  const toggleAllLocations = useCallback(() => {
    const q = locationSearch.toLowerCase()
    const filtered = q
      ? locationEntities.filter(
          (e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q)
        )
      : locationEntities
    setSelectedLocations((prev) => {
      const allSelected = filtered.every((e) => prev.has(e.id))
      if (allSelected) {
        const next = new Set(prev)
        filtered.forEach((e) => next.delete(e.id))
        return next
      } else {
        const next = new Set(prev)
        filtered.forEach((e) => next.add(e.id))
        return next
      }
    })
    setSuccessCount(null)
  }, [locationEntities, locationSearch])

  // Collect all selected entities for preview and generation
  const allSelected: LabelEntity[] = useMemo(() => {
    const items = itemEntities.filter((e) => selectedItems.has(e.id))
    const locs = locationEntities.filter((e) => selectedLocations.has(e.id))
    return [...items, ...locs]
  }, [itemEntities, locationEntities, selectedItems, selectedLocations])

  // Generate labels — opens PDF in new tab for print preview
  const handleGenerate = useCallback(async () => {
    if (allSelected.length === 0) return
    setGenerating(true)
    setError(null)
    setSuccessCount(null)
    // Revoke previous blob URL
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }

    try {
      if (labelFormat === "avery5260" || labelFormat === "avery18163" || labelFormat === "avery18294") {
        const textScaleMap: Record<TextSize, number> = { xs: 0.6, small: 0.8, normal: 1.0, large: 1.3, xl: 1.6 }
        const url = await fetchSheetPdf(allSelected, startCell, labelFormat, textScaleMap[textSize], footerText)
        setPdfUrl(url)
        openPdfPreview(url)
        setSuccessCount(allSelected.length)
      } else {
        // For single-label formats, generate one at a time and open each
        let completed = 0
        const errors: string[] = []
        for (const entity of allSelected) {
          try {
            const url = await fetchLabelPdf(entity.entityType, entity.id, labelFormat)
            openPdfPreview(url)
            // Keep last URL for download option
            if (pdfUrl) URL.revokeObjectURL(pdfUrl)
            setPdfUrl(url)
            completed++
          } catch (err) {
            errors.push(
              `${entity.name}: ${err instanceof Error ? err.message : "Unknown error"}`
            )
          }
        }
        if (errors.length > 0) {
          setError(`Failed for ${errors.length} label(s): ${errors[0]}`)
        }
        if (completed > 0) {
          setSuccessCount(completed)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate labels")
    } finally {
      setGenerating(false)
    }
  }, [allSelected, labelFormat, startCell, textSize, pdfUrl, footerText])

  const handleDownload = useCallback(() => {
    if (!pdfUrl) return
    const filename =
      labelFormat === "avery5260" || labelFormat === "avery18163" || labelFormat === "avery18294"
        ? `labels-${labelFormat}.pdf`
        : `label.pdf`
    downloadBlobUrl(pdfUrl, filename)
  }, [pdfUrl, labelFormat])

  const totalSelected = selectedItems.size + selectedLocations.size

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Label Center</h1>
        <p className="text-muted-foreground mt-1">
          Generate, reprint, and batch print labels for items and locations.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Selection panel */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select Entities</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="items" className="flex-1 min-h-[44px]">
                    <Package className="mr-1.5 h-4 w-4" />
                    Items
                    {selectedItems.size > 0 && (
                      <Badge variant="secondary" className="ml-1.5">
                        {selectedItems.size}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="locations" className="flex-1 min-h-[44px]">
                    <MapPin className="mr-1.5 h-4 w-4" />
                    Locations
                    {selectedLocations.size > 0 && (
                      <Badge variant="secondary" className="ml-1.5">
                        {selectedLocations.size}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="items">
                  <EntitySelectionList
                    entities={itemEntities}
                    selected={selectedItems}
                    onToggle={toggleItem}
                    onToggleAll={toggleAllItems}
                    search={itemSearch}
                    onSearchChange={setItemSearch}
                    isLoading={itemsLoading}
                    entityType="item"
                  />
                </TabsContent>

                <TabsContent value="locations">
                  <EntitySelectionList
                    entities={locationEntities}
                    selected={selectedLocations}
                    onToggle={toggleLocation}
                    onToggleAll={toggleAllLocations}
                    search={locationSearch}
                    onSearchChange={setLocationSearch}
                    isLoading={locationsLoading}
                    entityType="location"
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Preview & Actions panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Format selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Label Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={labelFormat}
                onChange={(e) => {
                  const val = e.target.value as typeof labelFormat
                  setLabelFormat(val)
                  // Reset start cell when switching templates
                  setStartCell(1)
                }}
                className="min-h-[44px]"
                aria-label="Label format"
              >
                <option value="avery5260">Avery 5260 (1" × 2⅝", 30/sheet)</option>
                <option value="avery18163">Avery 18163 (2" × 4", 10/sheet)</option>
                <option value="avery18294">Avery 18294 (⅔" × 1¾", 60/sheet)</option>
                <option value="adhesive">Adhesive (single small label)</option>
                <option value="sheet">Sheet (full page, single label)</option>
              </Select>

              {(labelFormat === "avery5260" || labelFormat === "avery18163" || labelFormat === "avery18294") && (
                <>
                  <div>
                    <label className="text-sm font-medium">Text Size</label>
                    <Select
                      value={textSize}
                      onChange={(e) => setTextSize(e.target.value as TextSize)}
                      className="mt-1 min-h-[44px]"
                      aria-label="Text size"
                    >
                      <option value="xs">Extra Small</option>
                      <option value="small">Small</option>
                      <option value="normal">Normal</option>
                      <option value="large">Large</option>
                      <option value="xl">Extra Large</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Start at cell</label>
                    <p className="text-xs text-muted-foreground mb-1">
                      Skip cells 1–{startCell - 1} for partial sheet reuse.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={LABEL_TEMPLATES[labelFormat as SheetTemplate]?.maxCells ?? 30}
                        value={startCell}
                        onChange={(e) => {
                          const max = LABEL_TEMPLATES[labelFormat as SheetTemplate]?.maxCells ?? 30
                          setStartCell(Math.max(1, Math.min(max, Number(e.target.value) || 1)))
                        }}
                        className="w-20 h-10"
                      />
                      <span className="text-sm text-muted-foreground">
                        of {LABEL_TEMPLATES[labelFormat as SheetTemplate]?.maxCells ?? 30}
                      </span>
                    </div>
                    {allSelected.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {allSelected.length} label{allSelected.length !== 1 ? "s" : ""} starting at cell {startCell}
                        {(() => {
                          const max = LABEL_TEMPLATES[labelFormat as SheetTemplate]?.maxCells ?? 30
                          return allSelected.length + startCell - 1 > max
                            ? ` (${Math.ceil((allSelected.length + startCell - 1) / max)} pages)`
                            : ""
                        })()}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Generate button */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Button
                onClick={handleGenerate}
                disabled={totalSelected === 0 || generating}
                size="lg"
                className="w-full min-h-[48px]"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Printer className="mr-2 h-5 w-5" />
                    Preview &amp; Print {totalSelected > 0 ? `${totalSelected} Label${totalSelected !== 1 ? "s" : ""}` : "Labels"}
                  </>
                )}
              </Button>

              {pdfUrl && (
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  size="lg"
                  className="w-full min-h-[48px]"
                >
                  <Download className="mr-2 h-5 w-5" />
                  Download PDF
                </Button>
              )}

              {totalSelected === 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  Select items or locations to generate labels.
                </p>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {successCount != null && successCount > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-green-500/50 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                  <Eye className="h-4 w-4 shrink-0" />
                  <span>
                    {successCount} label{successCount !== 1 ? "s" : ""} opened for printing.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Label Preview */}
          {allSelected.length > 0 && (labelFormat === "avery5260" || labelFormat === "avery18163" || labelFormat === "avery18294") && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Label Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Single label close-up */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Label close-up</p>
                  <SingleLabelPreview
                    entity={allSelected[0]}
                    template={labelFormat as SheetTemplate}
                    textSize={textSize}
                    footerText={footerText}
                  />
                </div>

                {/* Sheet grid preview */}
                <SheetPreview
                  entities={allSelected}
                  template={labelFormat as SheetTemplate}
                  startCell={startCell}
                  textSize={textSize}
                />
              </CardContent>
            </Card>
          )}

          {/* Simple list preview for non-sheet formats */}
          {allSelected.length > 0 && labelFormat !== "avery5260" && labelFormat !== "avery18163" && labelFormat !== "avery18294" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Preview ({allSelected.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[350px] space-y-2 overflow-y-auto">
                  {allSelected.map((entity) => (
                    <SingleLabelPreview
                      key={entity.id}
                      entity={entity}
                      template="avery5260"
                      textSize="normal"
                      footerText={footerText}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
