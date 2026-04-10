from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_admin, get_current_super_admin, hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.services.audit import log_action

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    # ADMIN só pode criar OPERATOR; SUPER_ADMIN pode criar qualquer role
    if current_user.role == UserRole.ADMIN and data.role != UserRole.OPERATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ADMIN só pode criar usuários com papel OPERATOR",
        )

    # Verifica email duplicado
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email já cadastrado",
        )

    DEFAULT_PASSWORD = "Mudar@123"
    user = User(
        email=data.email,
        hashed_password=hash_password(DEFAULT_PASSWORD),
        full_name=data.full_name,
        role=data.role,
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    await log_action(db, current_user, "create_user", "user", user.id, user.full_name)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    # ADMIN não pode alterar role de SUPER_ADMIN nem promover para SUPER_ADMIN
    if current_user.role == UserRole.ADMIN:
        if user.role == UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Não é possível editar um SUPER_ADMIN")
        if data.role == UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Não é possível promover para SUPER_ADMIN")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)

    await db.flush()
    await db.refresh(user)

    await log_action(db, current_user, "update_user", "user", user.id, user.full_name)
    return user


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    user_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    new_password: str = body.get("password", "")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter ao menos 6 caracteres")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if current_user.role == UserRole.ADMIN and user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Não é possível alterar senha de SUPER_ADMIN")

    user.hashed_password = hash_password(new_password)
    await db.flush()

    await log_action(db, current_user, "reset_password", "user", user.id, user.full_name)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Não é possível deletar a si mesmo")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    await log_action(db, current_user, "delete_user", "user", user_id, user.full_name)
    await db.delete(user)
