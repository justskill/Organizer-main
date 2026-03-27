import { useMemo } from "react"
import { Link } from "react-router-dom"
import {
  Plus,
  MapPin,
  Package,
  AlertTriangle,
  Wrench,
  CircleOff,
} from "lucide-react"
import { useItems } from "@/hooks/useItems"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { ItemResponse } from "@/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Configurable threshold in days for "needs maintenance" detection */
const MAINTENANCE_THRESHOLD_DAYS = 30

function isWithinThreshold(dateStr: string | null, thresholdDays = MAINTENANCE_THRESHOLD_DAYS): boolean {
  if (!dateStr) return false
  const due = new Date(dateStr)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= thresholdDays && diffDays >= -365 // include overdue up to a year
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const due = new Date(dateStr)
  const now = new Date()
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ---------------------------------------------------------------------------
// Dashboard sections derived from items
// ---------------------------------------------------------------------------

function useDashboardData(items: ItemResponse[]) {
  return useMemo(() => {
    const recentlyAdded = [...items]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 5)

    const recentlyMoved = [...items]
      .filter((i) => i.current_placement?.placed_at)
      .sort(
        (a, b) =>
          new Date(b.current_placement!.placed_at).getTime() -
          new Date(a.current_placement!.placed_at).getTime()
      )
      .slice(0, 5)

    const lowStock = items.filter(
      (i) =>
        i.quantity_on_hand != null &&
        i.minimum_quantity != null &&
        i.quantity_on_hand < i.minimum_quantity
    )

    const needsMaintenance = items.filter(
      (i) =>
        isWithinThreshold(i.maintenance_due_date) ||
        isWithinThreshold(i.calibration_due_date)
    )

    const unassigned = items.filter((i) => !i.current_placement)

    return { recentlyAdded, recentlyMoved, lowStock, needsMaintenance, unassigned }
  }, [items])
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ItemRow({ item }: { item: ItemResponse }) {
  return (
    <Link to={`/items/${item.id}`} className="flex items-center justify-between py-2 min-h-[44px] hover:bg-muted/30 rounded-md px-1 -mx-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {item.code} · {item.item_type.replace("_", " ")}
        </p>
      </div>
      {item.current_placement?.location_name && (
        <Badge variant="secondary" className="ml-2 shrink-0">
          {item.current_placement.location_name}
        </Badge>
      )}
    </Link>
  )
}

function DashboardSection({
  title,
  icon: Icon,
  items,
  emptyText,
  renderItem,
}: {
  title: string
  icon: React.ElementType
  items: ItemResponse[]
  emptyText: string
  renderItem?: (item: ItemResponse) => React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <span className="ml-auto text-xs text-muted-foreground">
          {items.length}
        </span>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              renderItem ? <div key={item.id}>{renderItem(item)}</div> : <ItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MaintenanceItemRow({ item }: { item: ItemResponse }) {
  const maintDays = daysUntil(item.maintenance_due_date)
  const calDays = daysUntil(item.calibration_due_date)

  // Pick the most urgent date
  const urgentLabel =
    maintDays !== null && isWithinThreshold(item.maintenance_due_date)
      ? calDays !== null && isWithinThreshold(item.calibration_due_date) && calDays < maintDays
        ? { type: "Calibration", days: calDays }
        : { type: "Maintenance", days: maintDays }
      : calDays !== null && isWithinThreshold(item.calibration_due_date)
        ? { type: "Calibration", days: calDays }
        : null

  const urgencyClass =
    urgentLabel && urgentLabel.days < 0
      ? "text-red-600"
      : urgentLabel && urgentLabel.days <= 7
        ? "text-orange-600"
        : "text-yellow-600"

  return (
    <Link to={`/items/${item.id}`} className="flex items-center justify-between py-2 min-h-[44px] hover:bg-muted/30 rounded-md px-1 -mx-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {item.code} · {item.condition?.replace("_", " ") ?? item.item_type.replace("_", " ")}
        </p>
      </div>
      {urgentLabel && (
        <span className={`ml-2 shrink-0 text-xs font-medium ${urgencyClass}`}>
          {urgentLabel.days < 0
            ? `${urgentLabel.type} overdue ${Math.abs(urgentLabel.days)}d`
            : urgentLabel.days === 0
              ? `${urgentLabel.type} due today`
              : `${urgentLabel.type} in ${urgentLabel.days}d`}
        </span>
      )}
    </Link>
  )
}

function SectionSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { data, isLoading, isError } = useItems({ pageSize: 200 })
  const items = data?.items ?? []
  const {
    recentlyAdded,
    recentlyMoved,
    lowStock,
    needsMaintenance,
    unassigned,
  } = useDashboardData(items)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your inventory catalog.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" className="min-h-[44px]">
            <Link to="/items/new">
              <Plus className="mr-1.5 h-4 w-4" />
              New Item
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="min-h-[44px]">
            <Link to="/locations/new">
              <MapPin className="mr-1.5 h-4 w-4" />
              New Location
            </Link>
          </Button>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-destructive">
            Failed to load dashboard data. Please try again.
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SectionSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Dashboard sections */}
      {!isLoading && !isError && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <DashboardSection
            title="Recently Added"
            icon={Package}
            items={recentlyAdded}
            emptyText="No items yet."
          />
          <DashboardSection
            title="Recently Moved"
            icon={MapPin}
            items={recentlyMoved}
            emptyText="No recent movements."
          />
          <DashboardSection
            title="Low Stock"
            icon={AlertTriangle}
            items={lowStock}
            emptyText="All stock levels are healthy."
          />
          <DashboardSection
            title="Needs Maintenance"
            icon={Wrench}
            items={needsMaintenance}
            emptyText="No upcoming maintenance."
            renderItem={(item) => <MaintenanceItemRow item={item} />}
          />
          <DashboardSection
            title="Unassigned Items"
            icon={CircleOff}
            items={unassigned}
            emptyText="All items are assigned."
          />
        </div>
      )}
    </div>
  )
}
