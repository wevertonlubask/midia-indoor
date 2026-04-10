"""
Seed inicial: cria usuário admin, uma tela de exemplo e tickers básicos.
Execute com: python -m app.seed
"""
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.screen import Screen
from app.models.ticker import Ticker, TickerType
from app.models.playlist import Playlist


async def seed():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        # --- Usuário SUPER_ADMIN ---
        result = await db.execute(select(User).where(User.email == "admin@signflow.com"))
        if not result.scalar_one_or_none():
            admin = User(
                id=str(uuid.uuid4()),
                email="admin@signflow.com",
                hashed_password=hash_password("admin123"),
                full_name="Administrador SignFlow",
                role=UserRole.SUPER_ADMIN,
                is_active=True,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(admin)
            await db.flush()
            print(f"✅ Admin criado: admin@signflow.com / admin123")
        else:
            result2 = await db.execute(select(User).where(User.email == "admin@signflow.com"))
            admin = result2.scalar_one()
            print(f"ℹ️  Admin já existe: admin@signflow.com")

        # --- Usuário OPERATOR de exemplo ---
        result = await db.execute(select(User).where(User.email == "operador@signflow.com"))
        if not result.scalar_one_or_none():
            operator = User(
                id=str(uuid.uuid4()),
                email="operador@signflow.com",
                hashed_password=hash_password("operador123"),
                full_name="Operador Exemplo",
                role=UserRole.OPERATOR,
                is_active=True,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(operator)
            print(f"✅ Operador criado: operador@signflow.com / operador123")

        # --- Playlist padrão ---
        result = await db.execute(select(Playlist).where(Playlist.name == "Playlist Padrão"))
        if not result.scalar_one_or_none():
            playlist = Playlist(
                id=str(uuid.uuid4()),
                name="Playlist Padrão",
                is_active=True,
                created_by=admin.id,
                created_at=datetime.now(timezone.utc),
            )
            db.add(playlist)
            await db.flush()
            print(f"✅ Playlist padrão criada: {playlist.id}")
        else:
            result2 = await db.execute(select(Playlist).where(Playlist.name == "Playlist Padrão"))
            playlist = result2.scalar_one()
            print(f"ℹ️  Playlist padrão já existe")

        # --- Tela de exemplo ---
        result = await db.execute(select(Screen).where(Screen.name == "Telão Principal"))
        if not result.scalar_one_or_none():
            screen_id = str(uuid.uuid4())
            screen = Screen(
                id=screen_id,
                name="Telão Principal",
                location="Recepção",
                token=str(uuid.uuid4()),
                is_active=True,
                playlist_id=playlist.id,
                config={"resolution": "1920x1080", "orientation": "landscape"},
                created_at=datetime.now(timezone.utc),
            )
            db.add(screen)
            print(f"✅ Tela criada: {screen.name} (ID: {screen_id})")
            print(f"   URL do telão: http://localhost:3000/display/{screen_id}")

        # --- Tickers padrão ---
        result = await db.execute(select(Ticker))
        if not result.scalars().all():
            tickers = [
                Ticker(
                    id=str(uuid.uuid4()),
                    content="Bem-vindo ao SENAI CFP 914 — Presidente Prudente! "
                            "Qualidade e excelência na formação profissional.",
                    type=TickerType.TEXT,
                    is_active=True,
                    order_index=0,
                    display_duration=30,
                    created_at=datetime.now(timezone.utc),
                ),
                Ticker(
                    id=str(uuid.uuid4()),
                    content=None,
                    type=TickerType.WEATHER,
                    is_active=True,
                    order_index=1,
                    display_duration=10,
                    config={"show_humidity": True, "show_wind": True},
                    created_at=datetime.now(timezone.utc),
                ),
            ]
            for t in tickers:
                db.add(t)
            print(f"✅ {len(tickers)} tickers criados")

        await db.commit()

    await engine.dispose()
    print("\n🚀 Seed concluído com sucesso!")
    print("   Admin:     admin@signflow.com / admin123")
    print("   Operador:  operador@signflow.com / operador123")
    print("   API Docs:  http://localhost:8000/docs")


if __name__ == "__main__":
    asyncio.run(seed())
