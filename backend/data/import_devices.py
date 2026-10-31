import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT = Path.home() / "OneDrive" / "Desktop" / "unbalanced" / "доступы.json"
TITLES = {
    "leak": "Датчик протечки",
    "barrier": "Шлагбаум",
    "thermostat": "Термостат",
    "counter": "Счётчик",
    "light": "Освещение",
}

src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
creds = json.loads(src.read_text(encoding="utf-8"))
apartment = creds.get("team_apartment") or creds["devices"][0].get("apartment_id")
now = datetime.now(timezone.utc).isoformat()

rows = []
for d in creds["devices"]:
    rows.append({
        "serial": d["sn"],
        "model": d["family"],
        "title": TITLES.get(d["family"], d["family"]),
        "apartment_id": int(d.get("apartment_id") or apartment),
        "building_id": None,
        "location": f"кв. {d.get('apartment_id') or apartment}",
        "note": f"{d.get('ext')}, {d.get('model')}",
        "enabled": True,
        "created_at": now,
        "updated_at": now,
    })

(HERE / "devices.json").write_text(
    json.dumps({"devices": rows}, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(f"импортировано {len(rows)} устройств из {src}")
for r in rows:
    print(r["serial"], r["model"], r["title"])
