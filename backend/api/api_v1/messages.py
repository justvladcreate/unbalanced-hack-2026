from typing import Annotated

from fastapi import APIRouter, Depends

from core.config import settings
from core.models import User
from api.api_v1.fastapi_users_router import current_active_user, current_active_superuser
from core.schemas.user import UserRead

router = APIRouter(
    prefix=settings.api.v1.messages,
    tags=["Messages"],
)

@router.get("")
async def get_user_messages(
    user: Annotated[
        User,
        Depends(current_active_user),
    ],
):
    return {
        "messages": ["m1", "m2", "m3"],
        "user": UserRead.model_validate(user, from_attributes=True),
    }

@router.get("/secrets")
async def get_superuser_messages(
    user: Annotated[
        User,
        Depends(current_active_superuser),
    ],
):
    return {
        "messages": ["secret-m1", "secret-m2", "secret-m3"],
        "user": UserRead.model_validate(user, from_attributes=True),
    }