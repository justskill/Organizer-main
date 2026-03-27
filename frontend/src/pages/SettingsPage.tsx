import { useState, useCallback, useEffect } from "react"
import {
  Settings,
  FolderTree,
  Users,
  Database,
  Key,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Download,
  Upload,
  AlertCircle,
  Copy,
  Check,
  X,
  Tag,
} from "lucide-react"
import { apiFetch } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Select } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryResponse {
  id: string
  name: string
  slug: string
  description: string | null
  parent_category_id: string | null
  metadata_schema_json: MetadataSchema | null
  children: CategoryResponse[]
}

interface MetadataField {
  name: string
  type: "text" | "number" | "date" | "select"
  required?: boolean
  options?: string[] // for select type
}

interface MetadataSchema {
  fields: MetadataField[]
}

interface APITokenListItem {
  id: string
  name: string
  created_at: string
}

interface APITokenResponse {
  id: string
  name: string
  token: string | null
  created_at: string
}

interface ImportSummary {
  created: number
  skipped: number
  errors: { row: number; error: string }[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = "/api/v1"

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("auth_token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function downloadExport(format: "json" | "csv"): Promise<void> {
  const res = await fetch(`${API_BASE}/export/${format}`, {
    method: "POST",
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || res.statusText)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `inventory-export.${format}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function importCsv(file: File): Promise<ImportSummary> {
  const formData = new FormData()
  formData.append("file", file)
  const token = localStorage.getItem("auth_token")
  const res = await fetch(`${API_BASE}/import/csv`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || res.statusText)
  }
  return res.json()
}


// ---------------------------------------------------------------------------
// Metadata Schema Editor
// ---------------------------------------------------------------------------

function MetadataSchemaEditor({
  schema,
  onChange,
}: {
  schema: MetadataSchema
  onChange: (schema: MetadataSchema) => void
}) {
  const addField = () => {
    onChange({
      fields: [
        ...schema.fields,
        { name: "", type: "text", required: false },
      ],
    })
  }

  const updateField = (index: number, updates: Partial<MetadataField>) => {
    const fields = schema.fields.map((f, i) =>
      i === index ? { ...f, ...updates } : f
    )
    onChange({ fields })
  }

  const removeField = (index: number) => {
    onChange({ fields: schema.fields.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Custom Fields</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addField}
          className="min-h-[44px]"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Field
        </Button>
      </div>

      {schema.fields.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No custom fields defined. Add fields to create a metadata template.
        </p>
      )}

      {schema.fields.map((field, index) => (
        <div
          key={index}
          className="rounded-lg border bg-muted/30 p-3 space-y-3"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <Input
                placeholder="Field name"
                value={field.name}
                onChange={(e) => updateField(index, { name: e.target.value })}
                className="min-h-[44px]"
              />
              <div className="flex gap-2">
                <Select
                  value={field.type}
                  onChange={(e) =>
                    updateField(index, {
                      type: e.target.value as MetadataField["type"],
                      options: e.target.value === "select" ? field.options ?? [""] : undefined,
                    })
                  }
                  className="min-h-[44px] flex-1"
                  aria-label="Field type"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="select">Select (dropdown)</option>
                </Select>
                <label className="flex items-center gap-1.5 text-sm whitespace-nowrap cursor-pointer min-h-[44px] px-2">
                  <input
                    type="checkbox"
                    checked={field.required ?? false}
                    onChange={(e) =>
                      updateField(index, { required: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  Required
                </label>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeField(index)}
              className="min-h-[44px] min-w-[44px] text-destructive hover:text-destructive"
              aria-label="Remove field"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {field.type === "select" && (
            <div className="space-y-2 pl-1">
              <Label className="text-xs text-muted-foreground">
                Options (one per line)
              </Label>
              <Textarea
                placeholder={"Option 1\nOption 2\nOption 3"}
                value={(field.options ?? []).join("\n")}
                onChange={(e) =>
                  updateField(index, {
                    options: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                rows={3}
                className="text-sm"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Categories Tab
// ---------------------------------------------------------------------------

function CategoriesTab() {
  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formParentId, setFormParentId] = useState("")
  const [formSchema, setFormSchema] = useState<MetadataSchema>({ fields: [] })
  const [saving, setSaving] = useState(false)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<CategoryResponse[]>("/categories")
      setCategories(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormName("")
    setFormDescription("")
    setFormParentId("")
    setFormSchema({ fields: [] })
  }

  const startEdit = (cat: CategoryResponse) => {
    setEditingId(cat.id)
    setFormName(cat.name)
    setFormDescription(cat.description ?? "")
    setFormParentId(cat.parent_category_id ?? "")
    setFormSchema(cat.metadata_schema_json ?? { fields: [] })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        parent_category_id: formParentId || null,
        metadata_schema_json:
          formSchema.fields.length > 0 ? formSchema : null,
      }

      if (editingId) {
        await apiFetch(`/categories/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        })
      } else {
        await apiFetch("/categories", {
          method: "POST",
          body: JSON.stringify(body),
        })
      }
      resetForm()
      await fetchCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category")
    } finally {
      setSaving(false)
    }
  }

  // Flatten categories for parent select
  const flatCategories: { id: string; name: string }[] = []
  const flatten = (cats: CategoryResponse[]) => {
    for (const c of cats) {
      if (c.id !== editingId) {
        flatCategories.push({ id: c.id, name: c.name })
      }
      if (c.children) flatten(c.children)
    }
  }
  flatten(categories)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Categories</h3>
          <p className="text-sm text-muted-foreground">
            Manage item categories and their metadata templates.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="min-h-[44px]">
            <Plus className="mr-1.5 h-4 w-4" />
            New Category
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editingId ? "Edit Category" : "New Category"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                placeholder="Category name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                placeholder="Optional description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-parent">Parent Category</Label>
              <Select
                id="cat-parent"
                value={formParentId}
                onChange={(e) => setFormParentId(e.target.value)}
                className="min-h-[44px]"
              >
                <option value="">None (root category)</option>
                {flatCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <Separator />

            <MetadataSchemaEditor
              schema={formSchema}
              onChange={setFormSchema}
            />

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="min-h-[44px]"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? "Update" : "Create"}
              </Button>
              <Button
                variant="outline"
                onClick={resetForm}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!loading && categories.length === 0 && !showForm && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FolderTree className="mx-auto h-8 w-8 mb-2" />
            <p>No categories yet. Create one to get started.</p>
          </CardContent>
        </Card>
      )}

      {!loading &&
        categories.map((cat) => (
          <Card key={cat.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{cat.name}</p>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {cat.slug}
                  </Badge>
                  {cat.metadata_schema_json &&
                    cat.metadata_schema_json.fields?.length > 0 && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {cat.metadata_schema_json.fields.length} field
                        {cat.metadata_schema_json.fields.length !== 1
                          ? "s"
                          : ""}
                      </Badge>
                    )}
                </div>
                {cat.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {cat.description}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startEdit(cat)}
                className="min-h-[44px] min-w-[44px] shrink-0"
                aria-label={`Edit ${cat.name}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Users Tab (placeholder)
// ---------------------------------------------------------------------------

function UsersTab() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">User Management</h3>
        <p className="text-sm text-muted-foreground">
          Manage user accounts and roles.
        </p>
      </div>
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Users className="mx-auto h-10 w-10 mb-3" />
          <p className="font-medium">Coming Soon</p>
          <p className="text-sm mt-1">
            User management will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Backup & Export Tab
// ---------------------------------------------------------------------------

function BackupTab() {
  const [exporting, setExporting] = useState<"json" | "csv" | null>(null)
  const [importing, setImporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportSuccess, setExportSuccess] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportSummary | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const handleExport = async (format: "json" | "csv") => {
    setExporting(format)
    setExportError(null)
    setExportSuccess(null)
    try {
      await downloadExport(format)
      setExportSuccess(
        `${format.toUpperCase()} export downloaded successfully.`
      )
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Export failed"
      )
    } finally {
      setExporting(null)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const result = await importCsv(file)
      setImportResult(result)
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Import failed"
      )
    } finally {
      setImporting(false)
      // Reset file input
      e.target.value = ""
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Backup & Export</h3>
        <p className="text-sm text-muted-foreground">
          Export your inventory data or import items from CSV.
        </p>
      </div>

      {/* Export */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Export Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Download a full export of your inventory data.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => handleExport("json")}
              disabled={exporting !== null}
              className="min-h-[44px]"
            >
              {exporting === "json" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("csv")}
              disabled={exporting !== null}
              className="min-h-[44px]"
            >
              {exporting === "csv" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export CSV
            </Button>
          </div>

          {exportError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{exportError}</span>
            </div>
          )}
          {exportSuccess && (
            <div className="flex items-center gap-2 rounded-md border border-green-500/50 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              <Check className="h-4 w-4 shrink-0" />
              <span>{exportSuccess}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Import CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Import items from a CSV file. Required columns: name, item_type.
          </p>
          <div>
            <label className="inline-flex cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleImport}
                disabled={importing}
                className="sr-only"
              />
              <span className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background hover:bg-accent hover:text-accent-foreground min-h-[44px]">
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Choose CSV File
                  </>
                )}
              </span>
            </label>
          </div>

          {importError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{importError}</span>
            </div>
          )}

          {importResult && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-green-700 dark:text-green-400">
                  {importResult.created} created
                </span>
                {importResult.skipped > 0 && (
                  <span className="text-yellow-700 dark:text-yellow-400">
                    {importResult.skipped} skipped
                  </span>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Errors:
                  </p>
                  <div className="max-h-[150px] overflow-y-auto space-y-1">
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive">
                        Row {err.row}: {err.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


// ---------------------------------------------------------------------------
// API Tokens Tab
// ---------------------------------------------------------------------------

function APITokensTab() {
  const [tokens, setTokens] = useState<APITokenListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create token
  const [showCreate, setShowCreate] = useState(false)
  const [tokenName, setTokenName] = useState("")
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchTokens = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<APITokenListItem[]>("/auth/tokens")
      setTokens(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tokens")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  const handleCreate = async () => {
    if (!tokenName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await apiFetch<APITokenResponse>("/auth/tokens", {
        method: "POST",
        body: JSON.stringify({ name: tokenName.trim() }),
      })
      setNewToken(res.token)
      setTokenName("")
      await fetchTokens()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token")
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setError(null)
    try {
      await apiFetch(`/auth/tokens/${id}`, { method: "DELETE" })
      await fetchTokens()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete token")
    } finally {
      setDeletingId(null)
    }
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">API Tokens</h3>
          <p className="text-sm text-muted-foreground">
            Create and manage API tokens for integrations.
          </p>
        </div>
        {!showCreate && !newToken && (
          <Button
            onClick={() => setShowCreate(true)}
            className="min-h-[44px]"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New Token
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* New token display */}
      {newToken && (
        <Card className="border-green-500/50">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-sm font-medium">
                  Token created successfully
                </p>
                <p className="text-xs text-muted-foreground">
                  Copy this token now. It won't be shown again.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
                {newToken}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(newToken)}
                className="min-h-[44px] min-w-[44px] shrink-0"
                aria-label="Copy token"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNewToken(null)
                setShowCreate(false)
              }}
              className="min-h-[44px]"
            >
              Done
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create form */}
      {showCreate && !newToken && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="token-name">Token Name</Label>
              <Input
                id="token-name"
                placeholder="e.g. Home Assistant Integration"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                className="min-h-[44px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={creating || !tokenName.trim()}
                className="min-h-[44px]"
              >
                {creating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Token
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreate(false)
                  setTokenName("")
                }}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Token list */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!loading && tokens.length === 0 && !showCreate && !newToken && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Key className="mx-auto h-8 w-8 mb-2" />
            <p>No API tokens. Create one for external integrations.</p>
          </CardContent>
        </Card>
      )}

      {!loading &&
        tokens.map((token) => (
          <Card key={token.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  Created{" "}
                  {new Date(token.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(token.id)}
                disabled={deletingId === token.id}
                className="min-h-[44px] min-w-[44px] shrink-0 text-destructive hover:text-destructive"
                aria-label={`Delete ${token.name}`}
              >
                {deletingId === token.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Preferences Tab
// ---------------------------------------------------------------------------

function PreferencesTab() {
  const [apiKey, setApiKey] = useState("")
  const [modelId, setModelId] = useState("")
  const [hasApiKey, setHasApiKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<{ model_identifier: string; has_api_key: boolean }>(
        "/settings/classification"
      )
      setModelId(data.model_identifier)
      setHasApiKey(data.has_api_key)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load classification settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const body: { api_key?: string | null; model_identifier: string } = {
        model_identifier: modelId || "google/gemini-2.5-flash-lite",
      }
      // Send api_key only when the user typed something, or send null to clear
      if (apiKey) {
        body.api_key = apiKey
      } else if (hasApiKey) {
        // User didn't touch the field — don't send api_key so it stays unchanged
      } else {
        body.api_key = null
      }
      const data = await apiFetch<{ model_identifier: string; has_api_key: boolean }>(
        "/settings/classification",
        { method: "PUT", body: JSON.stringify(body) }
      )
      setModelId(data.model_identifier)
      setHasApiKey(data.has_api_key)
      setApiKey("")
      setSuccess("Classification settings saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save classification settings")
    } finally {
      setSaving(false)
    }
  }

  const handleClearApiKey = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const data = await apiFetch<{ model_identifier: string; has_api_key: boolean }>(
        "/settings/classification",
        {
          method: "PUT",
          body: JSON.stringify({ api_key: null, model_identifier: modelId || "google/gemini-2.5-flash-lite" }),
        }
      )
      setModelId(data.model_identifier)
      setHasApiKey(data.has_api_key)
      setApiKey("")
      setSuccess("API key cleared. Classification is now disabled.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear API key")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Preferences</h3>
        <p className="text-sm text-muted-foreground">
          Customize your experience.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            AI Classification
            {!loading && (
              <Badge variant={hasApiKey ? "default" : "secondary"}>
                {hasApiKey ? "Configured" : "Not configured"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="ai-api-key">OpenRouter API Key</Label>
                <Input
                  id="ai-api-key"
                  type="password"
                  placeholder={hasApiKey ? "••••••••••••••••" : "Enter your OpenRouter API key"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {hasApiKey
                    ? "An API key is configured. Enter a new value to replace it."
                    : "Required for AI-powered item classification from photos."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-model-id">Model Identifier</Label>
                <Input
                  id="ai-model-id"
                  placeholder="google/gemini-2.5-flash-lite"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The OpenRouter model used for classification.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-start gap-2 rounded-md border border-green-500/50 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                  <Check className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{success}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
                {hasApiKey && (
                  <Button variant="outline" onClick={handleClearApiKey} disabled={saving}>
                    Clear API Key
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

export default // ---------------------------------------------------------------------------
// Labels Tab — label footer text stored in localStorage
// ---------------------------------------------------------------------------

function LabelsTab() {
  const [footerText, setFooterText] = useState(() =>
    localStorage.getItem("label_footer_text") ?? ""
  )
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    localStorage.setItem("label_footer_text", footerText)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = () => {
    setFooterText("")
    localStorage.removeItem("label_footer_text")
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Label Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure defaults for printed labels.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Footer Text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="label-footer-text">Common text on all labels</Label>
            <Input
              id="label-footer-text"
              placeholder='e.g. "Property of Acme Corp"'
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">
              This text appears at the bottom-right of every printed label. Leave blank to disable.
            </p>
          </div>

          {saved && (
            <div className="flex items-start gap-2 rounded-md border border-green-500/50 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              <Check className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Saved.</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSave}>Save</Button>
            {footerText && (
              <Button variant="outline" onClick={handleClear}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

function SettingsPage() {
  const [tab, setTab] = useState("categories")

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage categories, users, backup, and preferences.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="categories" className="flex-1 min-h-[44px]">
            <FolderTree className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Categories</span>
            <span className="sm:hidden">Cat.</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex-1 min-h-[44px]">
            <Users className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
            <span className="sm:hidden">Users</span>
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex-1 min-h-[44px]">
            <Database className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Backup</span>
            <span className="sm:hidden">Backup</span>
          </TabsTrigger>
          <TabsTrigger value="tokens" className="flex-1 min-h-[44px]">
            <Key className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">API Tokens</span>
            <span className="sm:hidden">Tokens</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex-1 min-h-[44px]">
            <Settings className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Preferences</span>
            <span className="sm:hidden">Prefs</span>
          </TabsTrigger>
          <TabsTrigger value="labels" className="flex-1 min-h-[44px]">
            <Tag className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Labels</span>
            <span className="sm:hidden">Labels</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="backup">
          <BackupTab />
        </TabsContent>
        <TabsContent value="tokens">
          <APITokensTab />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="labels">
          <LabelsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
