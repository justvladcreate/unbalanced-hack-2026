from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi_users.authentication.strategy.db import DatabaseStrategy
from fastapi_users.exceptions import UserNotExists
from pydantic import BaseModel

from api.dependencies.authentication import get_user_manager
from api.dependencies.authentication.strategy import get_database_strategy
from core.authentication.user_manager import UserManager
from core.schemas.user import UserCreate
from emulators.ujin_client import UjinClient

router = APIRouter(
    prefix="/ujin",
    tags=["UjinAuth"],
)


class UjinLogin(BaseModel):
    login: str
    password: str


@router.post("/login")
async def ujin_login(
    data: UjinLogin,
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
    strategy: Annotated[DatabaseStrategy, Depends(get_database_strategy)],
):
    client = UjinClient(
        base_url="https://api-uae-test.ujin.tech",
        dry_run=False,
        timeout=15,
    )

    try:
        result = client.authenticate(data.login, data.password)
    except Exception:
        raise HTTPException(status_code=401, detail="Ujin недоступен")

    if result.get("error") != 0:
        raise HTTPException(status_code=401, detail="Неверный телефон или пароль Ujin")

    ujin_user = (result.get("data") or {}).get("user") or {}
    ust = ujin_user.get("token") or ""

    if not ust:
        raise HTTPException(status_code=401, detail="Ujin не выдал токен")

    apartments = ujin_user.get("apartment") or []
    apartment_id = ""

    for apartment in apartments:
        if apartment.get("here") == 1:
            apartment_id = apartment.get("id", "")
            break

    if not apartment_id and apartments:
        apartment_id = apartments[0].get("id", "")

    email = data.login.replace("+", "") + "@ujin.example.com"

    try:
        user = await user_manager.get_by_email(email)
    except UserNotExists:
        user = await user_manager.create(
            UserCreate(
                email=email,
                password=data.password,
                password_confirm=data.password,
                phone=data.login,
                is_active=True,
                is_verified=True,
            ),
            safe=False,
        )

    token = await strategy.write_token(user)

    return {
        "access_token": token,
        "token_type": "bearer",
        "login": data.login,
        "phone": data.login,
        "ujin_token": ust,
        "apartment_id": apartment_id,
        "is_superuser": user.is_superuser,
        "user_id": user.id,
    }
