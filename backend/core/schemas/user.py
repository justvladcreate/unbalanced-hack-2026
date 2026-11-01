from typing import Annotated

from fastapi_users import schemas
from pydantic import Field, model_validator

class UserRead(schemas.BaseUser[int]):
    phone: str | None = None

class UserCreate(schemas.BaseUserCreate):
    password_confirm: str = Field(exclude=True)
    phone: str = None
    @model_validator(mode="after")
    def check_password(self):
        if self.password != self.password_confirm:
            raise ValueError("Password uncorected")
        return self


class UserUpdate(schemas.BaseUserUpdate):
    phone: str | None = None