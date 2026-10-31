from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional

BACKEND = Path(__file__).resolve().parent
EMULATORS = BACKEND.parent / "emulators"
if str(EMULATORS) not in sys.path:
    sys.path.insert(0, str(EMULATORS))

from devices import REGISTRY
from ujin_client import UjinClient

DEFAULT_CONDITION_PREFIX = "integrations_devices_"
DEFAULT_BASE_URL = "https://api-uae-test.ujin.tech"

DEFAULT_STORE = BACKEND / "scenarios.json"
CREDENTIALS = BACKEND.parent / "доступы.json"

IF_WORDS = ("если", "if")
THEN_RE = re.compile(r"\s+(?:то|then)\s+", re.IGNORECASE)
ARROWS = ("->", "=>", "→")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")
CONDITION_RE = re.compile(
    r"^(?P<dev>[^:=]+):(?P<sig>[^:=]+)\s*=\s*(?P<val>.+)$")
ACTION_RE = re.compile(
    r"^(?P<dev>[^:=]+):(?P<sig>[^:=]+)\s*[:=]\s*(?P<val>[^:\s]+)"
    r"(?::(?P<hold>\d+))?$")
PLATFORM_ID_KEYS = ("result", "id", "scenario_id")


class ScenarioError(ValueError):
    """Правило не разбирается или не проходит проверку — текст для человека."""


def silent(msg) -> None:
    pass


def scenario_id(resp) -> int:
    """id сценария из ответа autoscripts/edit (формат ответа не документирован)."""
    if not isinstance(resp, dict):
        return 0
    for key in PLATFORM_ID_KEYS:
        value = resp.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int) and value > 0:
            return value
        if isinstance(value, str) and value.isdigit() and int(value) > 0:
            return int(value)
    data = resp.get("data")
    return scenario_id(data) if isinstance(data, dict) else 0


def norm_value(raw) -> str:
    """Значение на провод: без пробелов и ':', числа — в короткой форме."""
    text = str(raw).strip()
    if not text:
        raise ScenarioError("пустое значение сигнала")
    if ":" in text or any(ch.isspace() for ch in text):
        raise ScenarioError(
            f"значение {text!r}: пробелы и ':' в значении недопустимы "
            f"(это разделители формата autoscripts)")
    try:
        number = float(text)
    except ValueError:
        return text
    return str(int(number)) if number.is_integer() else "%g" % number


def check_token(kind: str, token: str) -> str:
    token = str(token).strip()
    if not token:
        raise ScenarioError(f"пустое {kind}")
    if not TOKEN_RE.match(token):
        raise ScenarioError(
            f"{kind} {token!r}: допустимы латиница, цифры, точка, дефис, "
            f"подчёркивание — без пробелов и ':'")
    return token


def dict_name(signal: str, prefix: str = DEFAULT_CONDITION_PREFIX) -> str:
    if prefix and not signal.startswith(prefix):
        return prefix + signal
    return signal


def short_name(signal: str, prefix: str = DEFAULT_CONDITION_PREFIX) -> str:
    if prefix and signal.startswith(prefix):
        return signal[len(prefix):]
    return signal


def default_ust(path=None) -> str:
    """ust резидента для --live: env, иначе первый из доступы.json."""
    env = os.environ.get("UJIN_UST", "").strip()
    if env:
        return env
    credentials = Path(path or CREDENTIALS)
    try:
        data = json.loads(credentials.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ""
    for resident in data.get("residents") or []:
        if resident.get("ust"):
            return str(resident["ust"])
    return ""


@dataclass
class DeviceInfo:
    """Устройство квартиры глазами конструктора: sn + сигналы из декларации."""

    sn: str
    ext: str = ""
    family: str = ""
    title: str = ""
    model: str = ""
    signals: List[dict] = field(default_factory=list)

    def signal(self, name: str,
               prefix: str = DEFAULT_CONDITION_PREFIX) -> Optional[dict]:
        for item in self.signals:
            if item["name"] == name:
                return item
        short = short_name(name, prefix)
        for item in self.signals:
            if item["name"] == short:
                return item
        return None

    def signal_names(self) -> List[str]:
        return [item["name"] for item in self.signals]

    def as_dict(self) -> dict:
        return {"sn": self.sn, "ext": self.ext, "family": self.family,
                "title": self.title, "model": self.model,
                "signals": list(self.signals)}


class DeviceCatalog:
    """Устройства из доступы.json; по sn, ext или семейству — если оно одно."""

    def __init__(self, devices=None, source: str = ""):
        self.devices: List[DeviceInfo] = list(devices or [])
        self.source = source
        self.warnings: List[str] = []

    def find(self, token: str) -> Optional[DeviceInfo]:
        wanted = str(token).strip().lower()
        for device in self.devices:
            if wanted in (device.sn.lower(), device.ext.lower()):
                return device
        named = [d for d in self.devices if d.family.lower() == wanted]
        if len(named) == 1:
            return named[0]
        if len(named) > 1:
            raise ScenarioError(
                f"семейство {token!r} есть у {len(named)} устройств: "
                + ", ".join(d.ext or d.sn for d in named)
                + " — укажи sn или ext")
        return None

    def by_sn(self, sn: str) -> Optional[DeviceInfo]:
        for device in self.devices:
            if device.sn == str(sn):
                return device
        return None

    def label(self, sn: str) -> str:
        device = self.by_sn(sn)
        return device.title or device.ext or sn if device else sn

    def as_dict(self) -> dict:
        return {"source": self.source,
                "devices": [d.as_dict() for d in self.devices]}


def load_catalog(path=None, registry=None) -> DeviceCatalog:
    """Каталог устройств: sn/ext из доступы.json + сигналы из devices/."""
    credentials = Path(path) if path else CREDENTIALS
    registry = REGISTRY if registry is None else registry
    catalog = DeviceCatalog(source=str(credentials))
    if not credentials.exists():
        catalog.warnings.append(
            f"нет {credentials.name}: устройства вводятся вручную, "
            f"сигналы не проверяются")
        return catalog
    try:
        data = json.loads(credentials.read_text(encoding="utf-8"))
    except ValueError as exc:
        catalog.warnings.append(f"{credentials.name}: не JSON ({exc})")
        return catalog
    for item in data.get("devices") or []:
        family = str(item.get("family") or "")
        sn = str(item.get("sn") or "")
        cls = registry.get(family)
        signals: List[dict] = []
        title = family
        if cls is None:
            catalog.warnings.append(
                f"{family}: эмулятора нет, сигналы не проверяются")
        else:
            title = cls.title
            try:
                signals = cls(serial=sn or "0", logger=silent).declaration()
            except Exception as exc:  # декларация не должна ломать конструктор
                catalog.warnings.append(f"{family}: декларация не собралась ({exc})")
        catalog.devices.append(DeviceInfo(
            sn=sn, ext=str(item.get("ext") or ""), family=family,
            title=title, model=str(item.get("model") or ""), signals=signals))
    return catalog


@dataclass
class Trigger:
    sn: str
    signal: str
    value: str
    op: str = "="


@dataclass
class Action:
    sn: str
    signal: str
    value: str
    hold: int = 0


@dataclass
class Scenario:
    trigger: Trigger
    action: Action
    title: str = ""
    scenario_type: str = "trigger"
    warnings: List[str] = field(default_factory=list)

    def condition(self, prefix: str = DEFAULT_CONDITION_PREFIX) -> str:
        return (f"when:device-{self.trigger.sn}:"
                f"{dict_name(self.trigger.signal, prefix)}"
                f"{self.trigger.op}{self.trigger.value}")

    def set_signal(self, prefix: str = DEFAULT_CONDITION_PREFIX) -> str:
        text = (f"device-{self.action.sn}:"
                f"{short_name(self.action.signal, prefix)}:"
                f"{self.action.value}")
        return text + (f":{self.action.hold}" if self.action.hold else "")

    def as_dict(self) -> dict:
        return {"title": self.title, "scenario_type": self.scenario_type,
                "condition": self.condition(), "set_signal": self.set_signal(),
                "trigger": {"sn": self.trigger.sn, "signal": self.trigger.signal,
                            "value": self.trigger.value, "op": self.trigger.op},
                "action": {"sn": self.action.sn, "signal": self.action.signal,
                           "value": self.action.value, "hold": self.action.hold},
                "warnings": list(self.warnings)}


def resolve_device(token: str, catalog: Optional[DeviceCatalog]) -> str:
    raw = str(token).strip()
    if catalog and catalog.devices:
        device = catalog.find(raw)
        if device is None:
            known = ", ".join(d.ext or d.sn for d in catalog.devices)
            raise ScenarioError(
                f"устройство {raw!r} не найдено; известны: {known}")
        return device.sn
    return check_token("устройство", raw)


def parse_condition(text: str, catalog: Optional[DeviceCatalog] = None,
                    prefix: str = DEFAULT_CONDITION_PREFIX) -> Trigger:
    raw = str(text).strip().strip(",;")
    if raw.lower().startswith("when:"):
        raw = raw[len("when:"):].strip()
    if raw.lower().startswith("device-"):
        raw = raw[len("device-"):]
    match = CONDITION_RE.match(raw)
    if not match:
        raise ScenarioError(
            f"условие {text!r}: жду «<устройство>:<сигнал>=<значение>»")
    return Trigger(sn=resolve_device(match.group("dev"), catalog),
                   signal=check_token("сигнал", match.group("sig")),
                   value=norm_value(match.group("val")))


def parse_action(text: str, catalog: Optional[DeviceCatalog] = None,
                 prefix: str = DEFAULT_CONDITION_PREFIX) -> Action:
    raw = str(text).strip().strip(",;")
    if raw.lower().startswith("device-"):
        raw = raw[len("device-"):]
    match = ACTION_RE.match(raw)
    if not match:
        raise ScenarioError(
            f"действие {text!r}: жду «<устройство>:<сигнал>:<значение>[:hold]» "
            f"— удержание в секундах, необязательно")
    hold = int(match.group("hold") or 0)
    return Action(sn=resolve_device(match.group("dev"), catalog),
                  signal=check_token("сигнал", match.group("sig")),
                  value=norm_value(match.group("val")), hold=hold)


def split_rule(text: str):
    """Разделить правило на условие и действие: «если … то …», «… -> …», when:."""
    body = " ".join(str(text).split())
    for word in IF_WORDS:
        if body.lower().startswith(word + " "):
            body = body[len(word) + 1:].strip()
            break
    if body.lower().startswith("when:"):
        body = body[len("when:"):].strip()
        parts = body.split(None, 1)
        if len(parts) != 2:
            raise ScenarioError(
                "после условия нет действия: жду «when:device-… device-…»")
        return parts[0].strip(",;"), parts[1].strip(",;")
    for arrow in ARROWS:
        if arrow in body:
            left, right = body.split(arrow, 1)
            return left.strip(" ,;"), right.strip(" ,;")
    match = THEN_RE.search(body)
    if match:
        return (body[:match.start()].strip(" ,;"),
                body[match.end():].strip(" ,;"))
    raise ScenarioError(
        "не нашёл «то» (или «->»): правило целиком — "
        "«если <устройство>:<сигнал>=<значение> то "
        "<устройство>:<сигнал>:<значение>[:hold]»")


def collect_warnings(scenario: Scenario, catalog: Optional[DeviceCatalog],
                     prefix: str = DEFAULT_CONDITION_PREFIX) -> List[str]:
    """Мягкие предупреждения: 0 платформа не пишет, словарь ждёт ключ layout."""
    warnings = scenario.warnings
    if "0" in (scenario.trigger.value, scenario.action.value):
        warnings.append(
            "значение 0 платформа не пишет (мина №1) — для «выключено» "
            "используй 0.001 или сигнал с нулём в layout")
    if catalog is None or not catalog.devices:
        return warnings
    for role, sn, signal in (("условие", scenario.trigger.sn,
                              scenario.trigger.signal),
                             ("действие", scenario.action.sn,
                              scenario.action.signal)):
        device = catalog.by_sn(sn)
        if device is None:
            continue
        found = device.signal(signal, prefix)
        if found is None:
            raise ScenarioError(
                f"{role}: у {device.title or device.ext} "
                f"({device.sn}) нет сигнала {signal!r}; есть: "
                + ", ".join(device.signal_names()))
        layout = found.get("layout") or {}
        value = (scenario.trigger.value if role == "условие"
                 else scenario.action.value)
        if layout and value not in {str(k) for k in layout}:
            warnings.append(
                f"{role}: {signal}={value} вне словаря "
                + ", ".join(f"{k}={v}" for k, v in layout.items()))
    return warnings


def parse_rule(text: str, catalog: Optional[DeviceCatalog] = None,
               prefix: str = DEFAULT_CONDITION_PREFIX,
               strict: bool = True) -> Scenario:
    condition_text, action_text = split_rule(text)
    scenario = Scenario(
        trigger=parse_condition(condition_text, catalog if strict else None,
                                prefix),
        action=parse_action(action_text, catalog if strict else None, prefix))
    if strict:
        collect_warnings(scenario, catalog, prefix)
    return scenario


def default_title(scenario: Scenario,
                  catalog: Optional[DeviceCatalog] = None) -> str:
    if catalog is None:
        trigger_dev = scenario.trigger.sn
        action_dev = scenario.action.sn
    else:
        trigger_dev = catalog.label(scenario.trigger.sn)
        action_dev = catalog.label(scenario.action.sn)
    return (f"{trigger_dev}: {scenario.trigger.signal}={scenario.trigger.value}"
            f" → {action_dev}: {scenario.action.signal}="
            f"{scenario.action.value}")[:120]


class ScenarioStore:
    """Локальный список сценариев резидента (scenarios.json рядом с эмулятором)."""

    def __init__(self, path=None):
        self.path = Path(path) if path else DEFAULT_STORE

    def _read(self) -> dict:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {"next_id": 1, "items": []}
        if not isinstance(data, dict):
            return {"next_id": 1, "items": []}
        data.setdefault("next_id", 1)
        data.setdefault("items", [])
        return data

    def _write(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle, temp = tempfile.mkstemp(dir=str(self.path.parent),
                                        prefix=".scenarios-", suffix=".json")
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as stream:
                json.dump(data, stream, ensure_ascii=False, indent=2)
            os.replace(temp, self.path)
        except BaseException:
            try:
                os.unlink(temp)
            except OSError:
                pass
            raise

    def all(self) -> List[dict]:
        return list(self._read()["items"])

    def get(self, scenario_id_value: int) -> Optional[dict]:
        for item in self.all():
            if int(item.get("id") or 0) == int(scenario_id_value):
                return item
        return None

    def add(self, record: dict) -> dict:
        data = self._read()
        record = dict(record)
        record["id"] = int(data["next_id"])
        data["next_id"] = record["id"] + 1
        data["items"].append(record)
        self._write(data)
        return record

    def update(self, scenario_id_value: int, **fields) -> dict:
        data = self._read()
        for item in data["items"]:
            if int(item.get("id") or 0) == int(scenario_id_value):
                item.update(fields)
                self._write(data)
                return item
        raise ScenarioError(f"сценарий #{scenario_id_value} не найден")

    def remove(self, scenario_id_value: int) -> dict:
        data = self._read()
        kept = [i for i in data["items"]
                if int(i.get("id") or 0) != int(scenario_id_value)]
        if len(kept) == len(data["items"]):
            raise ScenarioError(f"сценарий #{scenario_id_value} не найден")
        data["items"] = kept
        self._write(data)
        return {"removed": int(scenario_id_value)}


class ScenarioService:
    """Создание/список/вкл-выкл сценариев: dry-run по умолчанию, --live на стенд."""

    def __init__(self, client: Optional[UjinClient] = None, ust: str = "",
                 store: Optional[ScenarioStore] = None,
                 catalog: Optional[DeviceCatalog] = None,
                 prefix: str = DEFAULT_CONDITION_PREFIX, logger=print):
        self.client = client if client is not None else UjinClient(
            base_url=DEFAULT_BASE_URL, dry_run=True, logger=logger)
        self.ust = ust
        self.store = store if store is not None else ScenarioStore()
        self.catalog = catalog if catalog is not None else load_catalog()
        self.prefix = prefix
        self.log = logger

    @property
    def live(self) -> bool:
        return not getattr(self.client, "dry_run", True)

    def _require_ust(self) -> str:
        if not self.ust:
            self.ust = default_ust()
        if not self.ust:
            raise ScenarioError(
                "для --live нужен ust резидента: --ust ust-… или UJIN_UST")
        return self.ust

    def build(self, rule: str = "", title: str = "", trigger: str = "",
              action: str = "", strict: bool = True) -> Scenario:
        if rule:
            scenario = parse_rule(rule, self.catalog, self.prefix,
                                  strict=strict)
        elif trigger and action:
            scenario = Scenario(
                trigger=parse_condition(trigger, self.catalog if strict else None,
                                        self.prefix),
                action=parse_action(action, self.catalog if strict else None,
                                    self.prefix))
            if strict:
                collect_warnings(scenario, self.catalog, self.prefix)
        else:
            raise ScenarioError(
                "нужно правило строкой или пара «условие + действие»")
        scenario.title = title.strip() or default_title(scenario, self.catalog)
        return scenario

    def check(self, rule: str = "", title: str = "", trigger: str = "",
              action: str = "") -> Scenario:
        return self.build(rule=rule, title=title, trigger=trigger,
                          action=action)

    def create(self, rule: str = "", title: str = "", trigger: str = "",
               action: str = "", enabled: bool = True) -> dict:
        scenario = self.build(rule=rule, title=title, trigger=trigger,
                              action=action)
        ust = self._require_ust() if self.live else self.ust
        response = self.client.autoscripts_edit(
            ust, 0, scenario.scenario_type,
            condition=scenario.condition(self.prefix),
            set_signal=scenario.set_signal(self.prefix),
            title=scenario.title)
        platform_id = scenario_id(response)
        if self.live and platform_id and enabled:
            self.client.autoscripts_activate(ust, platform_id)
        record = {
            "title": scenario.title,
            "scenario_type": scenario.scenario_type,
            "condition": scenario.condition(self.prefix),
            "set_signal": scenario.set_signal(self.prefix),
            "rule": rule or (f"{trigger} -> {action}"),
            "enabled": bool(enabled),
            "platform_id": platform_id,
            "mode": "live" if self.live else "dry-run",
            "warnings": list(scenario.warnings),
            "last_response": response,
            "created_at": datetime.now().isoformat(timespec="seconds"),
        }
        stored = self.store.add(record)
        self.log(f"[scenario] #{stored['id']} {stored['title']}: "
                 f"{stored['condition']} -> {stored['set_signal']} "
                 f"({'стенд' if self.live else 'dry-run'})")
        return stored

    def toggle(self, scenario_id_value: int, enabled: bool) -> dict:
        record = self.store.get(scenario_id_value)
        if record is None:
            raise ScenarioError(f"сценарий #{scenario_id_value} не найден")
        response = None
        if self.live:
            ust = self._require_ust()
            platform_id = int(record.get("platform_id") or 0)
            if not platform_id:
                raise ScenarioError(
                    f"у сценария #{scenario_id_value} нет platform_id: "
                    f"он не создавался на стенде")
            response = self.client.autoscripts_activate(ust, platform_id)
        updated = self.store.update(scenario_id_value, enabled=bool(enabled),
                                    last_response=response)
        self.log(f"[scenario] #{scenario_id_value} "
                 f"{'включён' if enabled else 'выключен'}")
        return updated

    def remove(self, scenario_id_value: int) -> dict:
        """Убрать из локального списка; на платформе ручки удаления нет."""
        return self.store.remove(scenario_id_value)

    def items(self) -> List[dict]:
        return self.store.all()

    def platform_list(self) -> dict:
        if not self.live:
            return {"dry_run": True, "items": self.items()}
        return self.client.autoscripts_list(self._require_ust())


def _group_label(signal: dict) -> str:
    return {"property": "свойство", "capability": "возможность",
            "setting": "настройка", "system": "система"}.get(
        signal.get("group") or "", "—")


def print_devices(catalog: DeviceCatalog) -> None:
    for warning in catalog.warnings:
        print(f"! {warning}")
    if not catalog.devices:
        print("устройств нет — создай сценарий строкой с sn вручную")
        return
    print(f"каталог: {catalog.source}")
    for device in catalog.devices:
        print(f"\n{device.family:<12} {device.title}  sn={device.sn}")
        print(f"{'':<12} ext={device.ext or '—'}")
        for signal in device.signals:
            if signal.get("kind") == "system":
                continue
            extra = []
            if signal.get("min") is not None or signal.get("max") is not None:
                extra.append(f"{signal.get('min', '')}..{signal.get('max', '')}")
            if signal.get("layout"):
                extra.append(", ".join(f"{k}={v}"
                                       for k, v in signal["layout"].items()))
            suffix = ("  " + "; ".join(extra)) if extra else ""
            print(f"  {_group_label(signal):<11} {signal['name']:<18}"
                  f" {signal['title']:<26}"
                  f" {signal['control']}/{signal['management']}{suffix}")


def print_scenarios(items: List[dict]) -> None:
    if not items:
        print("сценариев пока нет")
        return
    for item in items:
        state = "вкл " if item.get("enabled") else "выкл"
        print(f"#{item['id']:<3} [{state}] {item.get('title', '')}")
        print(f"      {item.get('condition', '')} -> {item.get('set_signal', '')}")
        if item.get("platform_id"):
            print(f"      id на стенде: {item['platform_id']}")
        for warning in item.get("warnings") or []:
            print(f"      ! {warning}")


def add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--live", action="store_true",
                        help="реальные вызовы autoscripts на стенде")
    parser.add_argument("--ust", default=os.environ.get("UJIN_UST", ""),
                        help="ust резидента (иначе UJIN_UST или доступы.json)")
    parser.add_argument("--base-url", "--base", dest="base_url",
                        default=os.environ.get("UJIN_BASE", DEFAULT_BASE_URL))
    parser.add_argument("--store", default=str(DEFAULT_STORE),
                        help="файл локального списка сценариев")
    parser.add_argument("--credentials", default=str(CREDENTIALS),
                        help="откуда брать sn/ext устройств")
    parser.add_argument("--prefix", default=DEFAULT_CONDITION_PREFIX,
                        help="префикс словаря в условии ('' — без префикса)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Сценарии умного дома «если — то»: ручной ввод резидентом")
    sub = parser.add_subparsers(dest="cmd")

    devices = sub.add_parser("devices", help="устройства и сигналы для правил")
    add_common(devices)

    check = sub.add_parser("check", help="проверить правило, ничего не создавая")
    check.add_argument("rule")
    add_common(check)

    add = sub.add_parser("add", help="создать сценарий")
    add.add_argument("rule", nargs="?", default="",
                     help="«если <устр>:<сигнал>=<знач> то <устр>:<сигнал>:<знач>[:hold]»")
    add.add_argument("--title", default="")
    add.add_argument("--trigger", default="", help="условие отдельно от --action")
    add.add_argument("--action", default="", help="действие отдельно от --trigger")
    add.add_argument("--off", action="store_true", help="создать выключенным")
    add_common(add)

    listing = sub.add_parser("list", help="локальный список или стенд")
    listing.add_argument("--platform", action="store_true",
                         help="спросить autoscripts/list на стенде")
    add_common(listing)

    for name, help_text in (("on", "включить сценарий"),
                            ("off", "выключить сценарий")):
        parser_on = sub.add_parser(name, help=help_text)
        parser_on.add_argument("id", type=int)
        add_common(parser_on)

    remove = sub.add_parser("remove", help="убрать из локального списка")
    remove.add_argument("id", type=int)
    add_common(remove)

    web = sub.add_parser("web", help="открыть веб-конструктор")
    web.add_argument("--port", type=int, default=8092)
    web.add_argument("--host", default="127.0.0.1")
    add_common(web)
    return parser


def make_service(args) -> ScenarioService:
    client = UjinClient(base_url=args.base_url, device_token="",
                        dry_run=not args.live, logger=print)
    return ScenarioService(client=client, ust=args.ust,
                           store=ScenarioStore(args.store),
                           catalog=load_catalog(args.credentials),
                           prefix=args.prefix)


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.cmd:
        parser.print_help()
        return 0
    if args.cmd == "web":
        import scenario_editor
        scenario_editor.serve(port=args.port, host=args.host,
                              live=args.live, ust=args.ust,
                              base_url=args.base_url, store=args.store,
                              credentials=args.credentials,
                              prefix=args.prefix)
        return 0

    service = make_service(args)
    try:
        if args.cmd == "devices":
            print_devices(service.catalog)
        elif args.cmd == "check":
            scenario = service.check(rule=args.rule)
            print("правило разобрано:")
            print("  условие:", scenario.condition(service.prefix))
            print("  действие:", scenario.set_signal(service.prefix))
            print("  название:", scenario.title)
            for warning in scenario.warnings:
                print("  !", warning)
        elif args.cmd == "add":
            record = service.create(rule=args.rule, title=args.title,
                                    trigger=args.trigger, action=args.action,
                                    enabled=not args.off)
            print(f"сценарий #{record['id']} сохранён "
                  f"({'стенд' if service.live else 'dry-run'})")
            print("  условие:", record["condition"])
            print("  действие:", record["set_signal"])
            print("  название:", record["title"])
            for warning in record["warnings"]:
                print("  !", warning)
            if not service.live:
                print("  чтобы отправить на стенд: тот же вызов с --live")
        elif args.cmd == "list":
            if args.platform:
                answer = service.platform_list()
                print(json.dumps(answer, ensure_ascii=False, indent=2)
                      if service.live else "dry-run: стенд не спрашиваем")
            print_scenarios(service.items())
        elif args.cmd in ("on", "off"):
            service.toggle(args.id, args.cmd == "on")
        elif args.cmd == "remove":
            service.remove(args.id)
            print(f"сценарий #{args.id} убран из локального списка")
    except ScenarioError as exc:
        print(f"ошибка: {exc}")
        return 2
    except Exception as exc:
        print(f"платформа ответила ошибкой: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
