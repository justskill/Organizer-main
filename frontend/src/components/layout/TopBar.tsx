import { Menu, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useLocation, Link } from "react-router-dom"
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar"

interface TopBarProps {
  onMenuClick: () => void
}

const routeLabels: Record<string, string> = {
  "": "Dashboard",
  items: "Items",
  locations: "Locations",
  scan: "Scan",
  labels: "Labels",
  settings: "Settings",
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const location = useLocation()
  const segments = location.pathname.split("/").filter(Boolean)

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden min-h-[44px] min-w-[44px]"
        onClick={onMenuClick}
        aria-label="Toggle navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Breadcrumb className="hidden sm:flex">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {segments.map((segment, index) => {
            const path = `/${segments.slice(0, index + 1).join("/")}`
            const isLast = index === segments.length - 1
            const label = routeLabels[segment] || segment
            return (
              <span key={path} className="contents">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={path}>{label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <GlobalSearchBar />
        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="User menu">
          <User className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
