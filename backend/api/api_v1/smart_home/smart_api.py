from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from core.config import settings
from core.models import db_helper, User, SmartHouse
from core.schemas.smart_house import SmartCreate, SmartHouseRead, DeviceAdd, DeviceCommand, ScenarioAdd
from api.api_v1.fastapi_users_router import current_active_user, current_active_superuser
from emulators.devices import REGISTRY
from emulators.ujin_client import UjinClient

router = APIRouter(prefix=settings.api.v1.smart, tags=["SmartProjects"])

ujin_client = UjinClient(
    base_url="https://api-uae-test.ujin.tech", dry_run=True,
    cls="integrations_devices", signal_prefix="integrations_devices_",
    ust="ust-2815121-6f30cdab01d04065cabc0229c67985ae", apartment_id="2989",
)

async def get_project(project_id: int, user: User, session: AsyncSession) -> SmartHouse:
    project = await session.get(SmartHouse, project_id)
    if not project or (project.owner_id != user.id and not user.is_superuser):
        raise HTTPException(status_code=404, detail="Проект не найден или нет доступа")
    return project

def evaluate_and_save(proj: SmartHouse, flag_field: str):
    flag_modified(proj, flag_field)

@router.get("/families")
async def families():
    return {"families": list(REGISTRY.keys())}

@router.get("", response_model=list[SmartHouseRead])
async def list_projects(
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
    ):
    projects = await session.execute(select(SmartHouse).where(SmartHouse.owner_id == user.id))
    return projects.scalars().all()

@router.post("", response_model=SmartHouseRead)
async def create_proj(
    data: SmartCreate,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
    ):
    project = SmartHouse(
        name_project=data.name, owner_id=user.id, apartment=getattr(data, "apartment", "2989"),
        owner_phone=getattr(user, "phone", None) or "+79903855761",
        devices=[],
        scenarios=[],
        notifications=[],
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project

@router.get("/{project_id}", response_model=SmartHouseRead)
async def get_proj_by_id(project_id: int, user: Annotated[User, Depends(current_active_user)], session: Annotated[AsyncSession, Depends(db_helper.session_getter)]):
    return await get_project(project_id, user, session)

@router.delete("/{project_id}")
async def delete_proj(
    project_id: int,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
    ):
    project = await get_project(project_id, user, session)
    await session.delete(project)
    await session.commit()
    return {"ok": True}

@router.post("/{project_id}/devices", response_model=SmartHouseRead)
async def add_device(
    project_id: int,
    data: DeviceAdd,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)]
    ):
    project = await get_project(project_id, user, session)
    if data.family not in REGISTRY:
        raise HTTPException(status_code=400, detail="Неизвестное семейство устройств")
    
    dev_id = f"{data.family}_{len(project.devices) + 1}"
    emul = REGISTRY[data.family](serial=dev_id, client=ujin_client)
    project.devices.append({
        "id": dev_id,
        "title": data.title,
        "family": data.family,
        "online": True,
        "state": {s.name: s.value for s in emul.signals.values()},
        "declaration": emul.declaration()
        })
    
    evaluate_and_save(project, "devices")
    await session.commit()
    await session.refresh(project)
    return project

@router.delete("/{project_id}/devices/{device_id}", response_model=SmartHouseRead)
async def delete_device(
    project_id: int,
    device_id: str,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)]
    ):
    project = await get_project(project_id, user, session)
    project.devices = [d for d in project.devices if d["id"] != device_id]
    evaluate_and_save(project, "devices")
    await session.commit()
    await session.refresh(project)
    return project

@router.post("/{project_id}/devices/{device_id}/command", response_model=SmartHouseRead)
async def device_cmd(
    project_id: int,
    device_id: str,
    cmd: DeviceCommand,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)]
    ):
    project = await get_project(project_id, user, session)
    dev = next((d for d in project.devices if d["id"] == device_id), None)
    if not dev: raise HTTPException(status_code=404, detail="Устройство не найдено")

    emul = REGISTRY[dev["family"]](serial=device_id, client=ujin_client)
    for k, v in dev["state"].items():
        if k in emul.signals: emul.signals[k].value = v

    if cmd.signal in emul.signals and emul.signals[cmd.signal].writable:
        emul.handle_recv({"recv": [{"command": "management", "id": device_id, cmd.signal: cmd.value}]})
        emul.step(1)
    else:
        emul.set_value(cmd.signal, cmd.value)
        emul.flush()

    dev["state"] = {s.name: s.value for s in emul.signals.values()}

    for sc in project.scenarios:
        trig = project.devices.count
        if sc["trigger_device_id"] == device_id and str(dev["state"].get(sc["trigger_signal"])) == str(sc["trigger_value"]):
            project.notifications.insert(0, {"scenario": sc["title"], "message": sc.get("notification_text", "Сработало!")})

    evaluate_and_save(project, "devices")
    evaluate_and_save(project, "notifications")
    await session.commit()
    await session.refresh(project)
    return project

@router.post("/{project_id}/scenarios", response_model=SmartHouseRead)
async def add_scenario(
    project_id: int,
    data: ScenarioAdd,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)]
    ):
    project = await get_project(project_id, user, session)
    project.scenarios.append({"id": len(project.scenarios) + 1, **data.model_dump()})
    evaluate_and_save(project, "scenarios")
    await session.commit()
    await session.refresh(project)
    return project

@router.delete("/{project_id}/scenarios/{scenario_id}", response_model=SmartHouseRead)
async def delete_scenario(
    project_id: int,
    scenario_id: int,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)]
    ):
    project = await get_project(project_id, user, session)
    project.scenarios = [s for s in project.scenarios if s.get("id") != scenario_id]
    evaluate_and_save(project, "scenarios")
    await session.commit()
    await session.refresh(project)
    return project

@router.get("/admin/all", response_model=list[SmartHouseRead])
async def admin_all(
    admin: Annotated[User, Depends(current_active_superuser)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)]
    ):
    res = await session.execute(select(SmartHouse))
    return res.scalars().all()