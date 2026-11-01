from typing import Any

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, ForeignKey, JSON

from core.models.base import Base
from core.models.mixins.int_id_pk import IntIdPkMixin


class SmartHouse(Base, IntIdPkMixin):
    name_project: Mapped[str] = mapped_column(String(length=120), default = None)
    owner_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    apartment: Mapped[str] = mapped_column(String(length=32), default = "2989")
    owner_phone: Mapped[str] = mapped_column(String(length=32), nullable=False)

    devices: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    scenarios: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    notifications: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


