import { useState, useRef, useCallback } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Zap, Camera, MapPin, RotateCcw, Check, ArrowLeft } from "lucide-react"
import { useCreateItem } from "@/hooks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import type { ItemType } from "@/types"

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: "Equipment", label: "Equipment" },
  { value: "Tool", label: "Tool" },
  { value: "Component", label: "Component" },
  { value: "Consumable", label: "Consumable" },
  { value: "Container", label: "Container" },
  { value: "Kit", label: "Kit" },
  { value: "Documented_Reference", label: "Documented Reference" },
]

interface SuccessInfo {
  name: string
  code: string
  id: string
}

export default function QuickAdd() {
  const navigate = useNavigate()
  const createItem = useCreateItem()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [name, setName] = useState("")
  const [itemType, setItemType] = useState<ItemType>("Equipment")
  const [locationCode, setLocationCode] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [bulkMode, setBulkMode] = useState(false)

  // Feedback
  const [lastCreated, setLastCreated] = useState<SuccessInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setName("")
    setPhoto(null)
    setLocationCode("")
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLastCreated(null)

    if (!name.trim()) {
      setError("Name is required.")
      return
    }

    try {
      const result = await createItem.mutateAsync({
        name: name.trim(),
        item_type: itemType,
      })

      const created = result.item

      if (bulkMode) {
        setLastCreated({ name: created.name, code: created.code, id: created.id })
        resetForm()
      } else {
        navigate(`/items/${created.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create item.")
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/" aria-label="Back to dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Quick Add
          </h1>
          <p className="text-sm text-muted-foreground">
            Fast item intake — just name and type.
          </p>
        </div>
      </div>

      {/* Success toast for bulk mode */}
      {lastCreated && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          <Check className="h-4 w-4 shrink-0" />
          <span>
            Created <strong>{lastCreated.name}</strong> ({lastCreated.code})
          </span>
          <Link
            to={`/items/${lastCreated.id}`}
            className="ml-auto text-xs underline underline-offset-2"
          >
            View
          </Link>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Item</CardTitle>
          <CardDescription>
            Fill in the basics. You can add more details later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="qa-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="qa-name"
                placeholder="e.g. Fluke 87V Multimeter"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>

            {/* Item Type */}
            <div className="space-y-1.5">
              <Label htmlFor="qa-type">
                Type <span className="text-destructive">*</span>
              </Label>
              <Select
                id="qa-type"
                value={itemType}
                onChange={(e) => setItemType(e.target.value as ItemType)}
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Optional: Photo */}
            <div className="space-y-1.5">
              <Label htmlFor="qa-photo" className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" />
                Photo <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="qa-photo"
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
              {photo && (
                <p className="text-xs text-muted-foreground">
                  Selected: {photo.name}
                </p>
              )}
            </div>

            {/* Optional: Location code */}
            <div className="space-y-1.5">
              <Label htmlFor="qa-location" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Location code{" "}
                <span className="text-xs text-muted-foreground">(optional — scan or type)</span>
              </Label>
              <Input
                id="qa-location"
                placeholder="e.g. LOC-A93K2M"
                value={locationCode}
                onChange={(e) => setLocationCode(e.target.value)}
              />
            </div>

            {/* Bulk mode toggle */}
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="qa-bulk"
                checked={bulkMode}
                onCheckedChange={(v) => setBulkMode(v)}
              />
              <Label htmlFor="qa-bulk" className="flex items-center gap-1.5 cursor-pointer">
                <RotateCcw className="h-3.5 w-3.5" />
                Bulk add mode
                <span className="text-xs text-muted-foreground">
                  — stay on this page after each add
                </span>
              </Label>
            </div>

            {/* Error */}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {/* Submit */}
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={createItem.isPending} className="flex-1">
                {createItem.isPending ? "Creating…" : bulkMode ? "Add & Continue" : "Create Item"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to="/items/new">Full Form</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
