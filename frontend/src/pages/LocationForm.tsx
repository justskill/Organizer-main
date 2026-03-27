import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { useCreateLocation, useUpdateLocation, useLocation, useLocations } from "@/hooks/useLocations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function LocationForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const createLocation = useCreateLocation()
  const updateLocation = useUpdateLocation(id ?? "")
  const { data: existing, isLoading: loadingExisting } = useLocation(isEdit ? id : undefined)
  const { data } = useLocations({ rootOnly: false })
  const allLocations = (data?.locations ?? []).filter((l) => l.id !== id)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [parentId, setParentId] = useState("")
  const [locationType, setLocationType] = useState("")
  const [notes, setNotes] = useState("")
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    if (isEdit && existing && !seeded) {
      setName(existing.name)
      setDescription(existing.description ?? "")
      setParentId(existing.parent_location_id ?? "")
      setLocationType(existing.location_type ?? "")
      setNotes(existing.notes ?? "")
      setSeeded(true)
    }
  }, [isEdit, existing, seeded])

  const isPending = createLocation.isPending || updateLocation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      parent_location_id: parentId || undefined,
      location_type: locationType.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    if (isEdit) {
      updateLocation.mutate(payload, {
        onSuccess: (loc) => navigate(`/locations/${loc.id}`),
      })
    } else {
      createLocation.mutate(payload, {
        onSuccess: (loc) => navigate(`/locations/${loc.id}`),
      })
    }
  }

  if (isEdit && loadingExisting) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(isEdit ? `/locations/${id}` : "/locations")} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{isEdit ? "Edit Location" : "New Location"}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Location Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="loc-name" className="text-sm font-medium">Name *</label>
              <Input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Garage Shelf A" className="mt-1" required />
            </div>
            <div>
              <label htmlFor="loc-parent" className="text-sm font-medium">Parent Location</label>
              <select id="loc-parent" value={parentId} onChange={(e) => setParentId(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">None (root location)</option>
                {allLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.path_text || l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="loc-type" className="text-sm font-medium">Location Type</label>
              <Input id="loc-type" value={locationType} onChange={(e) => setLocationType(e.target.value)} placeholder="e.g. Room, Shelf, Drawer" className="mt-1" />
            </div>
            <div>
              <label htmlFor="loc-desc" className="text-sm font-medium">Description</label>
              <Input id="loc-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="mt-1" />
            </div>
            <div>
              <label htmlFor="loc-notes" className="text-sm font-medium">Notes</label>
              <textarea id="loc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={3} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={!name.trim() || isPending}>
                {isPending ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create Location")}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `/locations/${id}` : "/locations")}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
