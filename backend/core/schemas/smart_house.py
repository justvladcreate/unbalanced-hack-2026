from typing import Any, Annotated

from pydantic import BaseModel, ConfigDict

class SmartCreate(BaseModel):
    name: str

class DeviceAdd(BaseModel):
    title: str
    family: str = "leak"

class DeviceCommand(BaseModel):
    signal: str
    value: Any

class ScenarioAdd(BaseModel):
    title: str
    trigger_device_id: str
    trigger_signal: str
    trigger_value: Any

    action_device_id: Annotated[str, None]
    action_signal: Annotated[str, None]
    action_value: Annotated[Any, None]
    notifications_text: str

class SmartHouseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name_project: str
    owner_id: int
    apartment: str
    owner_phone: str

    devices: list[dict[str, Any]]
    scenarios: list[dict[str, Any]]
    notifications: list[dict[str, Any]]
