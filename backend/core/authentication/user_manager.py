import logging

from fastapi_users import BaseUserManager, IntegerIDMixin
from fastapi import Request

from core.config import settings
from core.models import User



log = logging.getLogger(__name__)

class UserManager(IntegerIDMixin, BaseUserManager[User, int]):
    reset_password_token_secret = settings.access_token.reset_password_token_secret
    verification_token_secret = settings.access_token.verification_token_secret

    async def on_after_register(self, user: User, request: Request | None = None):
        log.warning("User %r has registered.", user.id)

    async def on_after_request_verify(
        self, user: User, token: str, request: Request | None = None
    ):
        log.warning("Verification requested for user %r. Verification token: %r", user.id, token)

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ):
        log.warning("User %r has forgot their password. Reset token : %r", user.id, token)