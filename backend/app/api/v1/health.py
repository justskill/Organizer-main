"""Health check endpoints for liveness and readiness probes."""

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.core.database import engine

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    status: str
    detail: str | None = None


@router.get("/live", response_model=HealthResponse)
async def liveness():
    """Liveness probe — returns 200 if the service is running."""
    return {"status": "ok"}


@router.get("/ready", response_model=HealthResponse)
async def readiness():
    """Readiness probe — returns 200 if the database is reachable."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}
