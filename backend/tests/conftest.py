"""Shared test fixtures for API endpoint unit tests.

Uses SQLite in-memory async database for fast, isolated tests.
Overrides FastAPI dependencies to inject test DB sessions and mock users.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.models.base import Base
from app.models.user import User, UserRole

# ---------------------------------------------------------------------------
# Register SQLite-compatible type compilers for PostgreSQL-specific types
# ---------------------------------------------------------------------------
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.ext.compiler import compiles

@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "TEXT"

@compiles(TSVECTOR, "sqlite")
def _compile_tsvector_sqlite(type_, compiler, **kw):
    return "TEXT"

# Import all models so Base.metadata knows about them
import app.models.item  # noqa: F401
import app.models.location  # noqa: F401
import app.models.placement  # noqa: F401
import app.models.tag  # noqa: F401
import app.models.media  # noqa: F401
import app.models.stock  # noqa: F401
import app.models.relationship  # noqa: F401
import app.models.label  # noqa: F401
import app.models.audit  # noqa: F401
import app.models.saved_view  # noqa: F401
import app.models.category  # noqa: F401
import app.models.api_token  # noqa: F401
import app.models.classification_settings  # noqa: F401


# ---------------------------------------------------------------------------
# Async SQLite engine for tests
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def engine():
    from sqlalchemy.pool import StaticPool

    eng = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # SQLite doesn't support CHECK constraints by default; disable FK enforcement
    @event.listens_for(eng.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.close()

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    from sqlalchemy.orm import attributes as sa_attrs

    def _set_rel_defaults(obj):
        """Set empty defaults for all unloaded relationships on an object."""
        try:
            mapper = type(obj).__mapper__
            state = sa_attrs.instance_state(obj)
            for prop in mapper.relationships:
                if prop.key not in state.dict:
                    if prop.uselist:
                        sa_attrs.set_committed_value(obj, prop.key, [])
                    else:
                        sa_attrs.set_committed_value(obj, prop.key, None)
        except Exception:
            pass

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        # Patch flush to refresh new objects and set relationship defaults
        _original_flush = session.flush

        async def _patched_flush(*args, **kwargs):
            new_objs = list(session.new)
            dirty_objs = list(session.dirty)
            await _original_flush(*args, **kwargs)
            for obj in new_objs + dirty_objs:
                try:
                    await session.refresh(obj)
                except Exception:
                    pass
                _set_rel_defaults(obj)

        session.flush = _patched_flush

        # Patch execute to set relationship defaults on all returned objects
        _original_execute = session.execute

        async def _patched_execute(stmt, *args, **kwargs):
            result = await _original_execute(stmt, *args, **kwargs)
            # For ORM results, set relationship defaults on loaded objects
            return result

        session.execute = _patched_execute

        # Use after_attach event to set defaults on objects entering the session
        @event.listens_for(session.sync_session, "loaded_as_persistent")
        def _on_load(sess, instance):
            _set_rel_defaults(instance)

        yield session


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        username="admin",
        password_hash=hash_password("adminpass"),
        display_name="Admin User",
        role=UserRole.Admin,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def editor_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        username="editor",
        password_hash=hash_password("editorpass"),
        display_name="Editor User",
        role=UserRole.Editor,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def viewer_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        username="viewer",
        password_hash=hash_password("viewerpass"),
        display_name="Viewer User",
        role=UserRole.Viewer,
    )
    db_session.add(user)
    await db_session.flush()
    return user


def _make_token(user: User) -> str:
    return create_access_token(user.id, user.role.value)


@pytest_asyncio.fixture
async def admin_token(admin_user: User) -> str:
    return _make_token(admin_user)


@pytest_asyncio.fixture
async def editor_token(editor_user: User) -> str:
    return _make_token(editor_user)


@pytest_asyncio.fixture
async def viewer_token(viewer_user: User) -> str:
    return _make_token(viewer_user)


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def client(db_session: AsyncSession, admin_user: User, admin_token: str):
    """AsyncClient wired to the FastAPI app with test DB and admin auth."""
    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app

    async def _override_get_db():
        yield db_session

    async def _override_get_current_user():
        return admin_user

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def unauth_client(db_session: AsyncSession):
    """AsyncClient with NO auth override — for testing 401 responses."""
    from app.core.database import get_db
    from app.main import app

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    # Do NOT override get_current_user — let it fail naturally

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def viewer_client(db_session: AsyncSession, viewer_user: User):
    """AsyncClient authenticated as a Viewer (read-only) user."""
    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app

    async def _override_get_db():
        yield db_session

    async def _override_get_current_user():
        return viewer_user

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helper to create items/locations directly in DB for test setup
# ---------------------------------------------------------------------------

async def create_test_item(
    db: AsyncSession,
    user: User,
    *,
    name: str = "Test Item",
    item_type: str = "Equipment",
    code: str | None = None,
    is_container: bool = False,
    quantity_on_hand: Decimal = Decimal("0"),
    archived_at: datetime | None = None,
    **kwargs,
):
    """Insert an Item directly into the test DB."""
    from app.models.item import Item, ItemType
    item = Item(
        id=uuid.uuid4(),
        code=code or f"ITM-{uuid.uuid4().hex[:6].upper()}",
        name=name,
        item_type=ItemType(item_type),
        is_container=is_container,
        is_consumable=False,
        is_serialized=False,
        quantity_on_hand=quantity_on_hand,
        created_by=user.id,
        archived_at=archived_at,
        **kwargs,
    )
    db.add(item)
    await db.flush()
    return item


async def create_test_location(
    db: AsyncSession,
    *,
    name: str = "Test Location",
    code: str | None = None,
    parent_location_id: uuid.UUID | None = None,
    archived_at: datetime | None = None,
):
    """Insert a Location directly into the test DB."""
    from app.models.location import Location
    loc = Location(
        id=uuid.uuid4(),
        code=code or f"LOC-{uuid.uuid4().hex[:6].upper()}",
        name=name,
        slug=name.lower().replace(" ", "-"),
        parent_location_id=parent_location_id,
        path_text=name,
    )
    if archived_at:
        loc.archived_at = archived_at
    db.add(loc)
    await db.flush()
    return loc
