from fastapi import APIRouter

from core.config import settings
from api.api_v1.fastapi_users_router import fastapi_users
from api.dependencies.authentication import authentication_backend
from core.schemas.user import UserCreate, UserRead


router = APIRouter(
    prefix=settings.api.v1.auth,
    tags=["Auth"],
)


router.include_router(
    router=fastapi_users.get_auth_router(
        authentication_backend,
    ),
)


router.include_router(
    router=fastapi_users.get_register_router(UserRead, UserCreate),
)

router.include_router(
    router=fastapi_users.get_verify_router(UserRead),
)


router.include_router(
    router=fastapi_users.get_reset_password_router(),
)

@router.get("/errors")
def views_errors(
    raise_error: bool = False,
):
    if raise_error:
        UserRead.model_validate(None)
    return {"ok": True}