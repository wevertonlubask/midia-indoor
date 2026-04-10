import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.main import app
from app.core.database import Base, get_db
from app.core.security import hash_password
from app.models.user import User, UserRole
import uuid
from datetime import datetime, timezone

TEST_DB_URL = "postgresql+asyncpg://signflow:signflow123@localhost:5432/signflow_test"


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    SessionLocal = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_user(db_session):
    user = User(
        id=str(uuid.uuid4()),
        email="testadmin@signflow.com",
        hashed_password=hash_password("admin123"),
        full_name="Test Admin",
        role=UserRole.SUPER_ADMIN,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_login_success(client, admin_user):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "testadmin@signflow.com", "password": "admin123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "testadmin@signflow.com"


@pytest.mark.asyncio
async def test_login_wrong_password(client, admin_user):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "testadmin@signflow.com", "password": "wrong"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client, admin_user):
    # Login primeiro
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": "testadmin@signflow.com", "password": "admin123"},
    )
    token = login_response.json()["access_token"]

    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["email"] == "testadmin@signflow.com"
