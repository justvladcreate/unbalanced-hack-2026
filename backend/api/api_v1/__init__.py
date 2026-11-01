from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer

from core.config import settings
from api.api_v1.ujin_auth import router as ujin_auth_router
from api.api_v1.auth import router as auth_router
from api.api_v1.users import router as users_router
from api.api_v1.messages import router as messages_router
from api.api_v1.smart_home.smart_api import router as smart_router

http_bearer = HTTPBearer(auto_error=False)

router = APIRouter(
    prefix=settings.api.v1.prefix,
    dependencies=[Depends(http_bearer)],
)

router.include_router(auth_router)
router.include_router(ujin_auth_router)
router.include_router(users_router)
router.include_router(messages_router)
router.include_router(smart_router)