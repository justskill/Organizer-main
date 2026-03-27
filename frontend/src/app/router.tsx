import { createBrowserRouter } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { ProtectedRoute } from "@/components/auth/ProtectedRoute"
import { lazy, Suspense } from "react"

const Login = lazy(() => import("@/pages/Login"))
const Dashboard = lazy(() => import("@/pages/Dashboard"))
const Items = lazy(() => import("@/pages/Items"))
const ItemDetailPage = lazy(() => import("@/pages/ItemDetailPage"))
const ItemForm = lazy(() => import("@/pages/ItemForm"))
const Locations = lazy(() => import("@/pages/Locations"))
const LocationDetailPage = lazy(() => import("@/pages/LocationDetailPage"))
const LocationForm = lazy(() => import("@/pages/LocationForm"))
const Scan = lazy(() => import("@/pages/Scan"))
const Labels = lazy(() => import("@/pages/Labels"))
const SettingsPage = lazy(() => import("@/pages/SettingsPage"))
const QuickAdd = lazy(() => import("@/pages/QuickAdd"))
const SearchPage = lazy(() => import("@/pages/SearchPage"))

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading...
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LazyPage><Login /></LazyPage>,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <LazyPage><Dashboard /></LazyPage> },
          { path: "items", element: <LazyPage><Items /></LazyPage> },
          { path: "items/quick-add", element: <LazyPage><QuickAdd /></LazyPage> },
          { path: "items/new", element: <LazyPage><ItemForm /></LazyPage> },
          { path: "items/:id", element: <LazyPage><ItemDetailPage /></LazyPage> },
          { path: "items/:id/edit", element: <LazyPage><ItemForm /></LazyPage> },
          { path: "locations", element: <LazyPage><Locations /></LazyPage> },
          { path: "locations/new", element: <LazyPage><LocationForm /></LazyPage> },
          { path: "locations/:id", element: <LazyPage><LocationDetailPage /></LazyPage> },
          { path: "locations/:id/edit", element: <LazyPage><LocationForm /></LazyPage> },
          { path: "scan", element: <LazyPage><Scan /></LazyPage> },
          { path: "labels", element: <LazyPage><Labels /></LazyPage> },
          { path: "settings", element: <LazyPage><SettingsPage /></LazyPage> },
          { path: "search", element: <LazyPage><SearchPage /></LazyPage> },
        ],
      },
    ],
  },
])
