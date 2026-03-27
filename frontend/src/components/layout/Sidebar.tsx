import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  Package,
  MapPin,
  ScanLine,
  Tags,
  Settings,
  Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/items", label: "Items", icon: Package },
  { to: "/locations", label: "Locations", icon: MapPin },
  { to: "/search", label: "Search", icon: Search },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/labels", label: "Labels", icon: Tags },
  { to: "/settings", label: "Settings", icon: Settings },
]

interface SidebarProps {
  collapsed?: boolean
  onNavigate?: () => void
}

export function Sidebar({ collapsed = false, onNavigate }: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 items-center px-4", collapsed ? "justify-center" : "gap-2")}>
        <Package className="h-6 w-6 shrink-0 text-primary" />
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight">Inventory</span>
        )}
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 p-2" role="navigation" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                "min-h-[44px]",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
