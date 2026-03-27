import { useState } from "react"
import type { ClassificationResult, ClassificationField, FormData } from "@/pages/ItemForm"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

interface ReviewPanelProps {
  result: ClassificationResult
  onApply: (fields: ClassificationField[]) => void
  onDiscard: () => void
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

export default function ReviewPanel({ result, onApply, onDiscard }: ReviewPanelProps) {
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
          <div key={index} className="flex items-center gap-3">
            <Checkbox
              checked={selected[index]}
              onCheckedChange={(checked) =>
                setSelected((prev) => ({ ...prev, [index]: checked }))
              }
              aria-label={`Include ${formatFieldName(field.field_name)}`}
            />
            <label className="w-28 shrink-0 text-sm font-medium">
              {formatFieldName(field.field_name)}
            </label>
            <Input
              value={editedValues[index] ?? field.value}
              onChange={(e) =>
                setEditedValues((prev) => ({ ...prev, [index]: e.target.value }))
              }
              className="flex-1"
              aria-label={`${formatFieldName(field.field_name)} value`}
            />
            <Badge className={confidenceClassName(field.confidence)}>
              {field.confidence}
            </Badge>
          </div>
        ))}
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
