import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

FILE = Path(__file__).parent / "devices.json"
db = {d["serial"]: d for d in json.loads(FILE.read_text("utf-8"))["devices"]} if FILE.exists() else {}


class Device(BaseModel):
    serial: str
    model: str
    title: str = ""
    apartment_id: int | None = None
    building_id: int | None = None
    location: str = ""
    note: str = ""
    enabled: bool = True


app = FastAPI()


def save():
    FILE.write_text(json.dumps({"devices": list(db.values())}, ensure_ascii=False, indent=2), "utf-8")


@app.get("/api/health")
def health():
    return {"status": "ok", "devices_total": len(db)}


@app.get("/api/devices")
def list_devices(model: str | None = None, q: str | None = None, limit: int = 100, offset: int = 0):
    rows = sorted(db.values(), key=lambda d: (d["model"], d["serial"]))
    if model:
        rows = [d for d in rows if d["model"] == model]
    if q:
        rows = [d for d in rows if q.lower() in str(d).lower()]
    return {"items": rows[offset:offset + limit], "total": len(rows)}


@app.get("/api/devices/{serial}")
def get_device(serial: str):
    if serial not in db:
        raise HTTPException(404, "нет такого устройства")
    return db[serial]


@app.post("/api/devices", status_code=201)
def create_device(device: Device):
    device.serial = device.serial.strip()
    device.model = device.model.strip()
    if not device.serial or not device.model:
        raise HTTPException(422, "serial и model обязательны")
    if device.serial in db:
        raise HTTPException(409, "устройство уже есть")
    now = datetime.now(timezone.utc).isoformat()
    db[device.serial] = {**device.model_dump(), "created_at": now, "updated_at": now}
    save()
    return db[device.serial]
