from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from core.config import settings
from core.models import db_helper, User, SmartHouse
from core.schemas.smart_house import (
    SmartCreate,
    SmartHouseRead,
    DeviceAdd,
    DeviceUpdate,
    DeviceCommand,
    ScenarioAdd,
)
from api.api_v1.fastapi_users_router import (
    current_active_user,
    current_active_superuser,
)

from emulators.devices import REGISTRY
from emulators.emulator_core import Device, Signal
from emulators.ujin_client import UjinClient

router = APIRouter(
    prefix=settings.api.v1.smart,
    tags=["SmartProjects"],
)

ujin_client = UjinClient(
    base_url="https://api-uae-test.ujin.tech",
    dry_run=True,
    cls="integrations_devices",
    signal_prefix="integrations_devices_",
    ust="ust-2815121-6f30cdab01d04065cabc0229c67985ae",
    apartment_id="2989",
)


async def get_user_project(
    project_id: int,
    user: User,
    session: AsyncSession,
) -> SmartHouse:
    project = await session.get(SmartHouse, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Проект не найден",
        )
    if project.owner_id != user.id and not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к чужому проекту",
        )
    return project


def build_emulator(device: dict):
    emulator = REGISTRY[device["family"]](serial=device["id"], client=ujin_client)

    for name, value in device.get("state", {}).items():
        if name in emulator.signals:
            emulator.signals[name].value = value

    if hasattr(emulator, "set_wet") and device.get("state", {}).get("leak") == 1:
        emulator.set_wet(True)

    return emulator


def evaluate_scenarios(project: SmartHouse):
    """Проверяет сценарии умного дома и формирует алерты на телефон."""
    devices_map = {d["id"]: d for d in project.devices}

    for sc in project.scenarios:
        trig_dev = devices_map.get(sc["trigger_device_id"])
        if not trig_dev:
            continue

        current_val = trig_dev["state"].get(sc["trigger_signal"])
        if str(current_val) == str(sc["trigger_value"]):
            act_dev = devices_map.get(sc.get("action_device_id"))
            if act_dev and sc.get("action_signal"):
                act_dev["state"][sc["action_signal"]] = sc["action_value"]

            project.notifications.insert(0, {
                "name_project": project.name_project,
                "phone": project.owner_phone,
                "scenario": sc["title"],
                "message": f"SMS на тел. {project.owner_phone}: {sc['notifications_text']}",
            })



@router.get("", response_model=list[SmartHouseRead])
async def get_my_projects(
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    stmt = select(SmartHouse).where(SmartHouse.owner_id == user.id)
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=SmartHouseRead)
async def create_project(
    data: SmartCreate,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    project = SmartHouse(
        name_project=data.name,
        owner_id=user.id,
        owner_phone=getattr(user, "phone", None) or "",
        devices=[],
        scenarios=[],
        notifications=[],
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


@router.get("/{project_id}", response_model=SmartHouseRead)
async def get_project_by_id(
    project_id: int,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    return await get_user_project(project_id, user, session)


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    project = await get_user_project(project_id, user, session)
    await session.delete(project)
    await session.commit()
    return {"ok": True}



@router.post("/{project_id}/devices", response_model=SmartHouseRead)
async def add_device_to_project(
    project_id: int,
    data: DeviceAdd,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    project = await get_user_project(project_id, user, session)
    if data.family not in REGISTRY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неизвестное семейство. Доступны: {list(REGISTRY.keys())}",
        )

    dev_id = f"{data.family}_{len(project.devices) + 1}"
    
    emulator_instance = REGISTRY[data.family](serial=dev_id, client=ujin_client)

    device_data = {
        "id": dev_id,
        "title": data.title,
        "family": data.family,
        "state": {s.name: s.value for s in emulator_instance.signals.values()},
        "declaration": emulator_instance.declaration(),
    }

    project.devices.append(device_data)
    flag_modified(project, "devices")
    await session.commit()
    await session.refresh(project)
    return project


@router.put("/{project_id}/devices/{device_id}", response_model=SmartHouseRead)
async def update_device(
    project_id: int,
    device_id: str,
    data: DeviceUpdate,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    project = await get_user_project(project_id, user, session)
    target_dev = next((d for d in project.devices if d["id"] == device_id), None)

    if not target_dev:
        raise HTTPException(status_code=404, detail="Устройство не найдено")

    if data.family and data.family != target_dev["family"]:
        if data.family not in REGISTRY:
            raise HTTPException(status_code=400, detail="Неизвестное семейство")

        emulator = REGISTRY[data.family](serial=device_id, client=ujin_client)
        target_dev["family"] = data.family
        target_dev["state"] = {s.name: s.value for s in emulator.signals.values()}
        target_dev["declaration"] = emulator.declaration()

    if data.title is not None:
        target_dev["title"] = data.title

    flag_modified(project, "devices")
    await session.commit()
    await session.refresh(project)
    return project


@router.delete("/{project_id}/devices/{device_id}", response_model=SmartHouseRead)
async def delete_device(
    project_id: int,
    device_id: str,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    project = await get_user_project(project_id, user, session)
    target_dev = next((d for d in project.devices if d["id"] == device_id), None)

    if not target_dev:
        raise HTTPException(status_code=404, detail="Устройство не найдено")

    project.devices = [d for d in project.devices if d["id"] != device_id]
    flag_modified(project, "devices")
    await session.commit()
    await session.refresh(project)
    return project


@router.post("/{project_id}/devices/{device_id}/tick", response_model=SmartHouseRead)
async def tick_device(
    project_id: int,
    device_id: str,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
    steps: int = 1,
):
    project = await get_user_project(project_id, user, session)
    target_dev = next((d for d in project.devices if d["id"] == device_id), None)

    if not target_dev:
        raise HTTPException(status_code=404, detail="Устройство не найдено")

    emulator = build_emulator(target_dev)

    for i in range(steps):
        emulator.step(1)

    target_dev["state"] = {s.name: s.value for s in emulator.signals.values()}
    evaluate_scenarios(project)

    flag_modified(project, "devices")
    flag_modified(project, "notifications")
    await session.commit()
    await session.refresh(project)
    return project


@router.post("/{project_id}/tick", response_model=SmartHouseRead)
async def tick_project(
    project_id: int,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
    steps: int = 1,
):
    project = await get_user_project(project_id, user, session)

    for device in project.devices:
        if device.get("family") not in REGISTRY:
            continue

        emulator = build_emulator(device)

        for i in range(steps):
            emulator.step(1)

        device["state"] = {s.name: s.value for s in emulator.signals.values()}

    evaluate_scenarios(project)

    flag_modified(project, "devices")
    flag_modified(project, "notifications")
    await session.commit()
    await session.refresh(project)
    return project


@router.post("/{project_id}/devices/{device_id}/command", response_model=SmartHouseRead)
async def update_device_signal(
    project_id: int,
    device_id: str,
    cmd: DeviceCommand,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    project = await get_user_project(project_id, user, session)
    target_dev = next((d for d in project.devices if d["id"] == device_id), None)
    if not target_dev:
        raise HTTPException(status_code=404, detail="Устройство не найдено")

    emulator = REGISTRY[target_dev["family"]](serial=device_id, client=ujin_client)
    for k, v in target_dev["state"].items():
        if k in emulator.signals:
            emulator.signals[k].value = v

    if cmd.signal not in emulator.signals:
        raise HTTPException(status_code=400, detail="Сигнал не найден у устройства")

    if hasattr(emulator, "set_wet") and cmd.signal == "leak":
        emulator.set_wet(bool(int(cmd.value)))
    
    emulator.handle_recv({
        "recv": [{"command": "management", "id": device_id, cmd.signal: cmd.value}]
    })
    emulator.step(1)  

    target_dev["state"] = {s.name: s.value for s in emulator.signals.values()}

    evaluate_scenarios(project)

    flag_modified(project, "devices")
    flag_modified(project, "notifications")
    await session.commit()
    await session.refresh(project)
    return project



@router.post("/{project_id}/scenarios", response_model=SmartHouseRead)
async def create_scenario(
    project_id: int,
    data: ScenarioAdd,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    project = await get_user_project(project_id, user, session)
    next_id = 1

    for scenario in project.scenarios:
        if scenario["id"] >= next_id:
            next_id = scenario["id"] + 1

    scenario_dict = {
        "id": next_id,
        **data.model_dump(),
    }
    project.scenarios.append(scenario_dict)
    evaluate_scenarios(project)

    flag_modified(project, "scenarios")
    flag_modified(project, "devices")
    flag_modified(project, "notifications")
    await session.commit()
    await session.refresh(project)
    return project


@router.put("/{project_id}/scenarios/{scenario_id}", response_model=SmartHouseRead)
async def update_scenario(
    project_id: int,
    scenario_id: int,
    data: ScenarioAdd,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    project = await get_user_project(project_id, user, session)
    found = False

    for i in range(len(project.scenarios)):
        if project.scenarios[i]["id"] == scenario_id:
            project.scenarios[i] = {
                "id": scenario_id,
                **data.model_dump(),
            }
            found = True

    if not found:
        raise HTTPException(status_code=404, detail="Сценарий не найден")

    evaluate_scenarios(project)

    flag_modified(project, "scenarios")
    flag_modified(project, "devices")
    flag_modified(project, "notifications")
    await session.commit()
    await session.refresh(project)
    return project


@router.delete("/{project_id}/scenarios/{scenario_id}", response_model=SmartHouseRead)
async def delete_scenario(
    project_id: int,
    scenario_id: int,
    user: Annotated[User, Depends(current_active_user)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    project = await get_user_project(project_id, user, session)
    found = False

    for scenario in project.scenarios:
        if scenario["id"] == scenario_id:
            found = True

    if not found:
        raise HTTPException(status_code=404, detail="Сценарий не найден")

    project.scenarios = [s for s in project.scenarios if s["id"] != scenario_id]

    flag_modified(project, "scenarios")
    await session.commit()
    await session.refresh(project)
    return project



@router.get("/admin/all", response_model=list[SmartHouseRead])
async def get_all_projects_for_admin(
    admin: Annotated[User, Depends(current_active_superuser)],
    session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
    result = await session.execute(select(SmartHouse))
    return result.scalars().all()