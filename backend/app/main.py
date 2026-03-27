"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup — seed default admin if needed
    from app.core.database import async_session_factory, engine
    from app.core.seed import seed_default_admin

    async with async_session_factory() as session:
        await seed_default_admin(session)

    yield
    # Shutdown
    await engine.dispose()


tags_metadata = [
    {"name": "health", "description": "Liveness and readiness probes for monitoring."},
    {"name": "auth", "description": "Authentication, login, and API token management."},
    {"name": "items", "description": "Item CRUD, movement, stock adjustment, relationships, and merge."},
    {"name": "locations", "description": "Location CRUD, hierarchy, contents, and tree views."},
    {"name": "categories", "description": "Item category CRUD with hierarchical support and metadata schemas."},
    {"name": "tags", "description": "Tag CRUD and item/location tag associations."},
    {"name": "search", "description": "Global full-text search and advanced structured filter queries."},
    {"name": "media", "description": "Media file upload, retrieval, deletion, and primary photo management."},
    {"name": "labels", "description": "QR label generation, scan resolution, and short code lookup."},
    {"name": "export", "description": "JSON/CSV export, CSV import, and full backup generation."},
    {"name": "saved-views", "description": "Saved search filter views per user."},
    {"name": "classification", "description": "LLM-powered image classification and settings management."},
]

app = FastAPI(
    title=settings.app_name,
    description=(
        "Self-hosted inventory, storage, and asset catalog system. "
        "Manage items, locations, containers, stock levels, QR labels, "
        "media attachments, and more via a versioned REST API."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=tags_metadata,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router includes
from app.api.v1 import auth, health, items, locations, categories, tags, search, media, labels, export, saved_views, classify

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(items.router, prefix="/api/v1")
app.include_router(locations.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(categories.items_router, prefix="/api/v1")
app.include_router(tags.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(media.router, prefix="/api/v1")
app.include_router(labels.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api/v1")
app.include_router(saved_views.router, prefix="/api/v1")
app.include_router(classify.router, prefix="/api/v1")
