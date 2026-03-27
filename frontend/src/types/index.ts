// Shared types for the inventory catalog frontend
export interface ApiError {
  detail: string
}

// Item types matching backend enums
export type ItemType =
  | "Consumable"
  | "Equipment"
  | "Component"
  | "Tool"
  | "Container"
  | "Kit"
  | "Documented_Reference"

export type ItemCondition =
  | "Available"
  | "In_Use"
  | "Loaned_Out"
  | "Needs_Repair"
  | "Retired"

export interface PlacementBrief {
  id: string
  location_id: string | null
  parent_item_id: string | null
  location_name: string | null
  container_name: string | null
  placed_at: string
}

export interface TagBrief {
  id: string
  name: string
  slug: string
  color: string | null
}

export interface MediaBrief {
  id: string
  file_path: string
  original_filename: string
  mime_type: string
  file_size: number
  is_primary: boolean
}

export interface CategoryBrief {
  id: string
  name: string
  slug: string
}

export interface ItemResponse {
  id: string
  code: string
  name: string
  description: string | null
  item_type: ItemType
  is_container: boolean
  is_consumable: boolean
  is_serialized: boolean
  brand: string | null
  model_number: string | null
  part_number: string | null
  serial_number: string | null
  condition: ItemCondition | null
  status: string | null
  quantity_mode: string | null
  unit_of_measure: string | null
  quantity_on_hand: number | null
  minimum_quantity: number | null
  reorder_quantity: number | null
  purchase_date: string | null
  purchase_source: string | null
  purchase_price: number | null
  warranty_expiration: string | null
  calibration_due_date: string | null
  maintenance_due_date: string | null
  metadata_json: Record<string, unknown> | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
  current_placement: PlacementBrief | null
  tags: TagBrief[]
  categories: CategoryBrief[]
  primary_photo: MediaBrief | null
  media: MediaBrief[]
}

export interface ItemListResponse {
  items: ItemResponse[]
  total: number
  page: number
  page_size: number
}

// Location types matching backend schemas

export interface LocationResponse {
  id: string
  code: string
  name: string
  slug: string | null
  description: string | null
  parent_location_id: string | null
  path_text: string | null
  location_type: string | null
  notes: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
  tags: TagBrief[]
  children: LocationResponse[]
}

export interface LocationTreeNode {
  id: string
  code: string
  name: string
  path_text: string | null
  location_type: string | null
  children: LocationTreeNode[]
}

export interface ItemBrief {
  id: string
  code: string
  name: string
  item_type: string
}

export interface LocationContents {
  location: LocationResponse
  items: ItemBrief[]
  child_locations: LocationResponse[]
}

export interface LocationListResponse {
  locations: LocationResponse[]
  total: number
  page: number
  page_size: number
}
