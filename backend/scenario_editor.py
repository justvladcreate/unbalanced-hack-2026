"""Веб-конструктор сценариев резидента: «если — то» мышью или текстом.

  python scenario_editor.py --port 8092          # dry-run, сеть не трогаем
  python scenario_editor.py --port 8092 --live   # создаём на стенде тест-ОАЭ

Страница http://127.0.0.1:8092: форма (устройство → сигнал → значение,
действие с удержанием), поле для правила строкой, список своих сценариев
с включением/выключением. Логика — в scenarios.py, здесь только UI.
"""
from __future__ import annotations

import html
import json
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

from scenarios import (DEFAULT_BASE_URL, DEFAULT_CONDITION_PREFIX,
                       DEFAULT_STORE, CREDENTIALS, ScenarioError,
                       ScenarioService, ScenarioStore, default_ust,
                       load_catalog)
from ujin_client import UjinClient


def build_service(store_path=None, credentials=None,
                  prefix: str = DEFAULT_CONDITION_PREFIX, live: bool = False,
                  ust: str = "", base_url: str = DEFAULT_BASE_URL,
                  logger=print) -> ScenarioService:
    client = UjinClient(base_url=base_url, device_token="",
                        dry_run=not live, logger=logger)
    return ScenarioService(client=client, ust=ust or (default_ust()
                                                      if live else ""),
                           store=ScenarioStore(store_path or DEFAULT_STORE),
                           catalog=load_catalog(credentials or CREDENTIALS),
                           prefix=prefix, logger=logger)


def catalog_payload(catalog) -> dict:
    devices = []
    for device in catalog.devices:
        signals = [s for s in device.signals if s.get("kind") != "system"]
        devices.append({
            "sn": device.sn,
            "ext": device.ext,
            "family": device.family,
            "title": device.title,
            "signals": signals,
        })
    return {"devices": devices, "warnings": list(catalog.warnings),
            "source": catalog.source}


def _escape(value) -> str:
    return html.escape("" if value is None else str(value))


STYLE = """
* { box-sizing: border-box; }
body { font: 15px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
       margin: 0; padding: 28px 16px 60px; background: #f5f6f8; color: #1c2024; }
main { max-width: 1020px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 17px; margin: 26px 0 10px; }
.sub { color: #5b6472; font-size: 13px; margin: 0 0 18px; }
.card { background: #fff; border: 1px solid #e2e6ec; border-radius: 10px;
        padding: 16px; box-shadow: 0 1px 2px rgba(20, 30, 50, .04); }
.mode { display: inline-block; padding: 2px 8px; border-radius: 999px;
        font-size: 12px; font-weight: 600; }
.mode.dry { background: #fff4d6; color: #7a5b00; }
.mode.live { background: #e2f5e8; color: #145c2e; }
.flash { padding: 10px 12px; border-radius: 8px; margin-bottom: 14px;
         font-size: 14px; }
.flash.ok { background: #e8f7ee; border: 1px solid #b6e3c6; color: #135a2e; }
.flash.bad { background: #fdecec; border: 1px solid #f3c2c2; color: #7d1d1d; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 12px; }
fieldset { border: 1px solid #e2e6ec; border-radius: 10px; padding: 12px 14px 14px;
           margin: 14px 0 0; }
legend { font-size: 12px; font-weight: 700; letter-spacing: .06em;
         text-transform: uppercase; color: #5b6472; padding: 0 6px; }
label { display: block; font-size: 12px; color: #5b6472; margin-bottom: 4px; }
input, select, textarea { width: 100%; padding: 8px 10px; font: inherit;
        border: 1px solid #cdd4de; border-radius: 8px; background: #fff; }
textarea { min-height: 62px; resize: vertical; font-size: 14px; }
input[type=checkbox] { width: auto; margin-right: 6px; }
button { font: inherit; padding: 9px 16px; border-radius: 8px; border: 1px solid #1f5fbf;
         background: #1f5fbf; color: #fff; cursor: pointer; }
button.ghost { background: #fff; color: #1f5fbf; }
button.danger { background: #fff; color: #a12828; border-color: #e0b4b4; }
button.small { padding: 4px 10px; font-size: 12px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #edf0f4;
         vertical-align: top; font-size: 14px; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em;
     color: #5b6472; }
.mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px;
        color: #5b6472; word-break: break-all; }
.on { color: #145c2e; font-weight: 600; }
.off { color: #8a6d00; font-weight: 600; }
.warn { color: #8a5a00; font-size: 12px; }
.empty { color: #5b6472; padding: 14px 0; }
.hint { font-size: 12px; color: #5b6472; margin-top: 6px; }
"""

SCRIPT = """
const CATALOG = __CATALOG__;
const devices = CATALOG.devices || [];

function bySn(sn) { return devices.find(d => d.sn === sn) || null; }

function makeOption(value, text) {
  const option = document.createElement('option');
  option.value = String(value);
  option.textContent = text;
  return option;
}

function fillDevices(select) {
  select.innerHTML = '';
  devices.forEach(d => select.appendChild(
    makeOption(d.sn, d.title + ' — ' + (d.ext || d.sn))));
}

function signalsFor(device, writable) {
  if (!device) return [];
  return device.signals.filter(s => writable
    ? (s.management === 'w' || s.management === 'rw')
    : (s.management === 'r' || s.management === 'rw'));
}

function fillSignals(devSelect, sigSelect, writable) {
  const device = bySn(devSelect.value);
  sigSelect.innerHTML = '';
  signalsFor(device, writable).forEach(s => sigSelect.appendChild(
    makeOption(s.name, s.title + ' (' + s.name + ')')));
}

function fillValue(devSelect, sigSelect, wrap, fieldName) {
  const device = bySn(devSelect.value);
  const signal = device ? device.signals.find(s => s.name === sigSelect.value)
                        : null;
  wrap.innerHTML = '';
  if (!signal) return;
  if (signal.layout && Object.keys(signal.layout).length) {
    const select = document.createElement('select');
    select.name = fieldName;
    Object.entries(signal.layout).forEach(([key, label]) =>
      select.appendChild(makeOption(key, key + ' — ' + label)));
    wrap.appendChild(select);
  } else if (signal.control === 'switch') {
    const select = document.createElement('select');
    select.name = fieldName;
    select.appendChild(makeOption('0', '0 — выключено'));
    select.appendChild(makeOption('1', '1 — включено'));
    wrap.appendChild(select);
  } else {
    const input = document.createElement('input');
    input.name = fieldName;
    input.required = true;
    const numeric = ['counter', 'float', 'time', 'push_time', 'temperature']
      .includes(signal.control) || signal.min != null || signal.max != null;
    input.type = numeric ? 'number' : 'text';
    if (signal.min != null) input.min = signal.min;
    if (signal.max != null) input.max = signal.max;
    input.step = numeric ? 'any' : '';
    input.placeholder = signal.measure || 'значение';
    wrap.appendChild(input);
  }
  const hint = document.createElement('div');
  hint.className = 'hint';
  const parts = [signal.title];
  if (signal.min != null || signal.max != null)
    parts.push((signal.min ?? '') + '..' + (signal.max ?? ''));
  if (signal.measure) parts.push(signal.measure);
  hint.textContent = parts.join(' · ');
  wrap.appendChild(hint);
}

function wire(devId, sigId, wrapId, fieldName, writable) {
  const dev = document.getElementById(devId);
  const sig = document.getElementById(sigId);
  const wrap = document.getElementById(wrapId);
  dev.addEventListener('change', () => {
    fillSignals(dev, sig, writable);
    fillValue(dev, sig, wrap, fieldName);
  });
  sig.addEventListener('change', () => fillValue(dev, sig, wrap, fieldName));
  fillDevices(dev);
  fillSignals(dev, sig, writable);
  fillValue(dev, sig, wrap, fieldName);
}

document.addEventListener('DOMContentLoaded', () => {
  wire('trigger_sn', 'trigger_signal', 'trigger_value_wrap',
       'trigger_value', false);
  wire('action_sn', 'action_signal', 'action_value_wrap',
       'action_value', true);
  if (devices.length > 1) {
    const action = document.getElementById('action_sn');
    action.value = devices[1].sn;
    action.dispatchEvent(new Event('change'));
  }
});
"""


def render_page(service: ScenarioService, message: str = "",
                error: str = "") -> str:
    catalog = service.catalog
    payload = json.dumps(catalog_payload(catalog), ensure_ascii=False)
    payload = payload.replace("</", "<\\/")
    mode_class = "live" if service.live else "dry"
    mode_text = "стенд" if service.live else "dry-run"
    ust = service.ust or default_ust()
    ust_text = ("ust резидента …" + ust[-6:]) if ust else "ust не задан"
    mode_hint = (f"{mode_text}, {ust_text}" if service.live
                 else f"{mode_text}: вызовы в консоль и scenarios.json, "
                      f"на стенд ничего не уходит")

    flash = ""
    if error:
        flash = f"<div class='flash bad'>{_escape(error)}</div>"
    elif message:
        flash = f"<div class='flash ok'>{_escape(message)}</div>"

    warnings = "".join(
        f"<div class='warn'>! {_escape(w)}</div>" for w in catalog.warnings)

    rows = []
    for item in service.items():
        enabled = bool(item.get("enabled"))
        state = ("<span class='on'>включён</span>" if enabled
                 else "<span class='off'>выключен</span>")
        toggle_value = "0" if enabled else "1"
        toggle_text = "Выключить" if enabled else "Включить"
        platform = (f"<div class='mono'>id на стенде: {item['platform_id']}"
                    f"</div>" if item.get("platform_id") else "")
        warns = "".join(f"<div class='warn'>! {_escape(w)}</div>"
                        for w in item.get("warnings") or [])
        response = item.get("last_response")
        response_text = ""
        if isinstance(response, dict) and response.get("error") not in (None, 0):
            response_text = (f"<div class='warn'>ответ платформы: "
                             f"{_escape(json.dumps(response, ensure_ascii=False))}"
                             f"</div>")
        rows.append(
            "<tr>"
            f"<td>#{item['id']}</td>"
            f"<td>{_escape(item.get('title'))}"
            f"<div class='mono'>{_escape(item.get('condition'))}</div>"
            f"<div class='mono'>→ {_escape(item.get('set_signal'))}</div>"
            f"{platform}{warns}{response_text}</td>"
            f"<td>{state}</td>"
            "<td><div class='row'>"
            f"<form method='post' action='/toggle'>"
            f"<input type='hidden' name='id' value='{item['id']}'>"
            f"<input type='hidden' name='enabled' value='{toggle_value}'>"
            f"<button class='small ghost'>{toggle_text}</button></form>"
            f"<form method='post' action='/delete' "
            f"onsubmit=\"return confirm('Убрать сценарий #{item['id']} из списка?')\">"
            f"<input type='hidden' name='id' value='{item['id']}'>"
            "<button class='small danger'>Удалить</button></form>"
            "</div></td>"
            "</tr>")
    scenarios = ("<table><tr><th>#</th><th>Сценарий</th><th>Состояние</th>"
                 "<th></th></tr>" + "".join(rows) + "</table>"
                 if rows else "<div class='empty'>Пока ни одного сценария. "
                              "Собери первый ниже.</div>")

    if not catalog.devices:
        devices_note = ("<div class='flash bad'>Устройства не загрузились: "
                        "нет доступы.json или в нём пустой список. "
                        "Создай сценарий правилом строкой.</div>")
    else:
        devices_note = ""

    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Сценарии умного дома</title>
<style>{STYLE}</style></head>
<body><main>
<h1>Сценарии умного дома</h1>
<p class="sub">Резидент сам вводит правило «если — то»:
  <span class="mode {mode_class}">{_escape(mode_text)}</span>
  <span class="mono">{_escape(mode_hint)}</span></p>
{flash}{warnings}{devices_note}

<h2>Новый сценарий</h2>
<div class="card">
<form method="post" action="/add">
  <label>Название (необязательно)</label>
  <input name="title" maxlength="120" placeholder="Протечка → открыть шлагбаум">
  <fieldset><legend>Когда</legend>
    <div class="grid">
      <div><label>Устройство</label><select id="trigger_sn" name="trigger_sn"></select></div>
      <div><label>Сигнал</label><select id="trigger_signal" name="trigger_signal"></select></div>
      <div><label>Значение</label><span id="trigger_value_wrap"></span></div>
    </div>
  </fieldset>
  <fieldset><legend>Тогда</legend>
    <div class="grid">
      <div><label>Устройство</label><select id="action_sn" name="action_sn"></select></div>
      <div><label>Сигнал</label><select id="action_signal" name="action_signal"></select></div>
      <div><label>Значение</label><span id="action_value_wrap"></span></div>
      <div><label>Удержать, с (0 — без возврата)</label>
        <input name="hold" type="number" min="0" step="1" value="0"></div>
    </div>
  </fieldset>
  <fieldset><legend>Или правилом строкой</legend>
    <textarea name="rule" placeholder="если leak:leak=1 то barrier:open_cmd=1:60"></textarea>
    <div class="hint">Заполненное правило главнее формы. Устройство — sn, ext
      или семейство; удержание — секунды после последнего «:».</div>
  </fieldset>
  <div class="row" style="margin-top:14px">
    <label style="margin:0"><input type="checkbox" name="enabled" checked>
      включить сразу</label>
    <button type="submit">Создать сценарий</button>
  </div>
</form>
</div>

<h2>Мои сценарии</h2>
<div class="card">{scenarios}</div>
<p class="hint">Сценарии создаются через autoscripts платформы: условие
  <span class="mono">when:device-&lt;sn&gt;:&lt;сигнал&gt;=&lt;значение&gt;</span>,
  действие <span class="mono">device-&lt;sn&gt;:&lt;сигнал&gt;:&lt;значение&gt;[:hold]</span>.
  Удаление убирает запись из локального списка: ручки удаления на платформе нет.</p>
</main>
<script>{SCRIPT.replace("__CATALOG__", payload)}</script>
</body></html>"""


def make_server(service: ScenarioService, host: str = "127.0.0.1",
                port: int = 0) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        server_version = "ScenarioEditor/1.0"

        def _send(self, code: int, body: bytes, content_type: str,
                  extra=None) -> None:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            for key, value in (extra or {}).items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(body)

        def _html(self, text: str, code: int = 200) -> None:
            self._send(code, text.encode("utf-8"),
                       "text/html; charset=utf-8")

        def _json(self, obj) -> None:
            self._send(200, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8")

        def _redirect(self, query: str) -> None:
            self._send(303, b"", "text/plain; charset=utf-8",
                       {"Location": query})

        def _form(self) -> dict:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b""
            parsed = urllib.parse.parse_qs(raw.decode("utf-8"))
            return {key: values[0] for key, values in parsed.items()}

        def _flash(self, message: str = "", error: str = "") -> None:
            if error:
                self._redirect("/?err=" + urllib.parse.quote(error))
            else:
                self._redirect("/?msg=" + urllib.parse.quote(message))

        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            if parsed.path == "/healthz":
                self._json({"ok": True, "mode": "live" if service.live
                            else "dry-run"})
                return
            if parsed.path == "/api/catalog":
                self._json(catalog_payload(service.catalog))
                return
            if parsed.path in ("/", "/index.html"):
                message = (query.get("msg") or [""])[0]
                error = (query.get("err") or [""])[0]
                self._html(render_page(service, message, error))
                return
            self._html(render_page(service, error="страница не найдена"), 404)

        def do_POST(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            form = self._form()
            try:
                if parsed.path == "/add":
                    record = service.create(
                        rule=(form.get("rule") or "").strip(),
                        title=form.get("title") or "",
                        trigger=self._trigger(form),
                        action=self._action(form),
                        enabled=form.get("enabled", "on") == "on")
                    self._flash(f"сценарий #{record['id']} создан: "
                                f"{record['condition']} → {record['set_signal']}")
                    return
                if parsed.path == "/toggle":
                    enabled = form.get("enabled") == "1"
                    service.toggle(int(form.get("id") or 0), enabled)
                    self._flash("сценарий включён" if enabled
                                else "сценарий выключен")
                    return
                if parsed.path == "/delete":
                    service.remove(int(form.get("id") or 0))
                    self._flash("сценарий убран из списка")
                    return
            except ScenarioError as exc:
                self._flash(error=str(exc))
                return
            except ValueError as exc:
                self._flash(error=f"не разобрал форму: {exc}")
                return
            except Exception as exc:
                self._flash(error=f"платформа ответила ошибкой: {exc}")
                return
            self._html(render_page(service, error="страница не найдена"), 404)

        @staticmethod
        def _trigger(form: dict) -> str:
            if (form.get("rule") or "").strip():
                return ""
            sn = (form.get("trigger_sn") or "").strip()
            signal = (form.get("trigger_signal") or "").strip()
            value = (form.get("trigger_value") or "").strip()
            if not (sn and signal and value):
                raise ScenarioError("для действия формы нужны устройство, "
                                    "сигнал и значение в блоке «Когда»")
            return f"{sn}:{signal}={value}"

        @staticmethod
        def _action(form: dict) -> str:
            if (form.get("rule") or "").strip():
                return ""
            sn = (form.get("action_sn") or "").strip()
            signal = (form.get("action_signal") or "").strip()
            value = (form.get("action_value") or "").strip()
            if not (sn and signal and value):
                raise ScenarioError("для действия формы нужны устройство, "
                                    "сигнал и значение в блоке «Тогда»")
            hold = (form.get("hold") or "").strip()
            suffix = ""
            if hold:
                try:
                    seconds = int(float(hold))
                except ValueError:
                    raise ScenarioError(f"удержание {hold!r} — нужно число секунд")
                if seconds < 0:
                    raise ScenarioError("удержание не может быть отрицательным")
                suffix = f":{seconds}" if seconds else ""
            return f"{sn}:{signal}:{value}{suffix}"

        def log_message(self, fmt, *args) -> None:
            return

    return ThreadingHTTPServer((host, port), Handler)


def serve(port: int = 8092, host: str = "127.0.0.1", live: bool = False,
          ust: str = "", base_url: str = DEFAULT_BASE_URL,
          store: Optional[str] = None, credentials: Optional[str] = None,
          prefix: str = DEFAULT_CONDITION_PREFIX) -> None:
    service = build_service(store_path=store, credentials=credentials,
                            prefix=prefix, live=live, ust=ust,
                            base_url=base_url)
    server = make_server(service, host=host, port=port)
    mode = "стенд" if service.live else "dry-run"
    print(f"конструктор сценариев: http://{host}:{server.server_address[1]} "
          f"({mode})", flush=True)
    for warning in service.catalog.warnings:
        print(f"! {warning}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Веб-конструктор сценариев")
    parser.add_argument("--port", type=int, default=8092)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--ust", default="")
    parser.add_argument("--base-url", "--base", dest="base_url",
                        default=DEFAULT_BASE_URL)
    parser.add_argument("--store", default=str(DEFAULT_STORE))
    parser.add_argument("--credentials", default=str(CREDENTIALS))
    parser.add_argument("--prefix", default=DEFAULT_CONDITION_PREFIX)
    cli = parser.parse_args()
    serve(port=cli.port, host=cli.host, live=cli.live, ust=cli.ust,
          base_url=cli.base_url, store=cli.store, credentials=cli.credentials,
          prefix=cli.prefix)
