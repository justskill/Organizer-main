import { useState } from "react"
import type { ClassificationResult, ClassificationField, FormData } from "@/pages/ItemForm"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

interface ReviewPanelProps {
  result: ClassificationResult
  onApply: (fields: ClassificationField[]) => void
  onDiscard: () => void
  showSavePhotos?: boolean
  savePhotos?: boolean
  onSavePhotosChange?: (checked: boolean) => void
}

function formatFieldName(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function confidenceClassName(confidence: "high" | "medium" | "low"): string {
  switch (confidence) {
    case "high":
      return "bg-green-100 text-green-800 border-green-200"
    case "medium":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "low":
      return "bg-red-100 text-red-800 border-red-200"
  }
}

export function applyClassificationToForm(
  form: FormData,
  fields: ClassificationField[]
): FormData {
  const updated = { ...form }
  for (const field of fields) {
    if (field.field_name === "is_consumable") {
      updated.is_consumable = field.value.toLowerCase() === "true"
    } else if (field.field_name in updated) {
      (updated as Record<string, unknown>)[field.field_name] = field.value
    }
  }
  return updated
}

export default function ReviewPanel({
  result,
  onApply,
  onDiscard,
  showSavePhotos = false,
  savePhotos = false,
  onSavePhotosChange,
}: ReviewPanelProps) {
  const [selected, setSelected] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(result.fields.map((_, i) => [i, true]))
  )
  const [editedValues, setEditedValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(result.fields.map((f, i) => [i, f.value]))
  )

  const isEmpty = result.fields.length === 0

  const handleApply = () => {
    const acceptedFields: ClassificationField[] = result.fields
      .map((f, i) => ({
        ...f,
        value: editedValues[i] ?? f.value,
      }))
      .filter((_, i) => selected[i])
    onApply(acceptedFields)
  }

  if (isEmpty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classification Results</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Could not classify the item from the provided images. Try using clearer or additional photos.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={onDiscard}>
            Close
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Classification Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.fields.map((field, index) => (
          <div
            key={index}
            className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selected[index]}
                onCheckedChange={(checked) =>
                  setSelected((prev) => ({ ...prev, [index]: checked }))
                }
                aria-label={`Include ${formatFieldName(field.field_name)}`}
              />
              <label className="shrink-0 text-sm font-medium sm:w-28">
                {formatFieldName(field.field_name)}
              </label>
              <Badge className={`sm:hidden ${confidenceClassName(field.confidence)}`}>
                {field.confidence}
              </Badge>
            </div>
            <div className="flex items-start gap-2 pl-6 sm:flex-1 sm:pl-0">
              <Textarea
                value={editedValues[index] ?? field.value}
                onChange={(e) =>
                  setEditedValues((prev) => ({ ...prev, [index]: e.target.value }))
                }
                rows={Math.max(1, Math.ceil((editedValues[index] ?? field.value).length / 40))}
                className="min-h-0 flex-1 resize-none py-1.5"
                aria-label={`${formatFieldName(field.field_name)} value`}
              />
              <Badge className={`hidden sm:inline-flex mt-1.5 ${confidenceClassName(field.confidence)}`}>
                {field.confidence}
              </Badge>
            </div>
          </div>
        ))}

        {showSavePhotos && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2 mt-2">
            <Checkbox
              checked={savePhotos}
              onCheckedChange={(checked) => onSavePhotosChange?.(!!checked)}
              aria-label="Save classification photos to item"
            />
            <label className="text-sm text-muted-foreground">
              Save classification photos to this item
            </label>
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button onClick={handleApply}>Apply</Button>
        <Button variant="outline" onClick={onDiscard}>
          Discard
        </Button>
      </CardFooter>
    </Card>
  )
}
