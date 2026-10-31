import contextlib
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.parse
import urllib.request
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import scenario_editor  # noqa: E402
import scenarios  # noqa: E402
from scenarios import (ScenarioError, ScenarioService, ScenarioStore,  # noqa: E402
                       dict_name, load_catalog, norm_value, parse_rule,
                       scenario_id, short_name)
from ujin_client import UjinClient  # noqa: E402

CREDENTIALS = {
    "devices": [
        {"family": "leak", "sn": "111", "ext": "leak_01",
         "model": "parkcloud_device"},
        {"family": "barrier", "sn": "222", "ext": "barrier_01",
         "model": "parkcloud_device"},
        {"family": "light", "sn": "333", "ext": "light_01",
         "model": "parkcloud_device"},
    ]
}


class CatalogCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "доступы.json"
        self.path.write_text(json.dumps(CREDENTIALS, ensure_ascii=False),
                             encoding="utf-8")
        self.catalog = load_catalog(self.path)


class CatalogTest(CatalogCase):
    def test_devices_and_declarations_loaded(self):
        self.assertEqual([d.sn for d in self.catalog.devices],
                         ["111", "222", "333"])
        leak = self.catalog.find("leak")
        self.assertEqual(leak.sn, "111")
        self.assertIn("leak", leak.signal_names())
        self.assertEqual(self.catalog.find("leak_01").sn, "111")

    def test_signal_resolved_by_short_and_dict_name(self):
        barrier = self.catalog.find("222")
        self.assertEqual(barrier.signal("open_cmd")["name"], "open_cmd")
        self.assertEqual(
            barrier.signal("integrations_devices_open_cmd")["name"], "open_cmd")
        self.assertIsNone(barrier.signal("siren"))

    def test_unknown_device_and_ambiguous_family(self):
        self.assertIsNone(self.catalog.find("unknown-device"))
        twin = scenarios.DeviceCatalog([
            scenarios.DeviceInfo(sn="1", ext="leak_a", family="leak"),
            scenarios.DeviceInfo(sn="2", ext="leak_b", family="leak"),
        ])
        with self.assertRaises(ScenarioError) as ctx:
            twin.find("leak")
        self.assertIn("leak_a", str(ctx.exception))

    def test_missing_credentials_is_not_fatal(self):
        catalog = load_catalog(Path(self.tmp.name) / "нет.json")
        self.assertEqual(catalog.devices, [])
        self.assertTrue(catalog.warnings)


class ParseTest(CatalogCase):
    def test_canonical_platform_rule(self):
        rule = ("when:device-222:integrations_devices_state=2 "
                "device-333:lamp:1:30")
        scenario = parse_rule(rule, self.catalog)
        self.assertEqual(scenario.trigger.sn, "222")
        self.assertEqual(scenario.action.sn, "333")
        self.assertEqual(scenario.action.hold, 30)
        self.assertEqual(scenario.condition(),
                         "when:device-222:integrations_devices_state=2")
        self.assertEqual(scenario.set_signal(), "device-333:lamp:1:30")

    def test_natural_language_with_equals_in_action(self):
        scenario = parse_rule("если leak:leak=1 то barrier:open_cmd=1:60",
                              self.catalog)
        self.assertEqual(scenario.trigger.sn, "111")
        self.assertEqual(scenario.action.sn, "222")
        self.assertEqual(scenario.action.hold, 60)
        self.assertEqual(scenario.set_signal(), "device-222:open_cmd:1:60")

    def test_arrow_and_family_alias(self):
        scenario = parse_rule("barrier:state=2 -> light:lamp=1", self.catalog)
        self.assertEqual(scenario.trigger.signal, "state")
        self.assertEqual(scenario.action.sn, "333")
        self.assertEqual(scenario.action.hold, 0)
        self.assertEqual(scenario.set_signal(), "device-333:lamp:1")

    def test_dict_prefix_not_doubled(self):
        scenario = parse_rule(
            "when:device-111:integrations_devices_leak=1 "
            "device-222:open_cmd:1", self.catalog)
        self.assertEqual(scenario.condition(),
                         "when:device-111:integrations_devices_leak=1")
        self.assertEqual(scenario.action.value, "1")

    def test_missing_then_is_explained(self):
        with self.assertRaises(ScenarioError) as ctx:
            parse_rule("barrier:state=2", self.catalog)
        self.assertIn("то", str(ctx.exception))

    def test_unknown_device_lists_candidates(self):
        with self.assertRaises(ScenarioError) as ctx:
            parse_rule("шкаф:state=2 то barrier:open_cmd=1", self.catalog)
        self.assertIn("не найдено", str(ctx.exception))
        self.assertIn("leak_01", str(ctx.exception))

    def test_unknown_signal_lists_available(self):
        with self.assertRaises(ScenarioError) as ctx:
            parse_rule("barrier:state=2 то barrier:siren=1", self.catalog)
        self.assertIn("нет сигнала", str(ctx.exception))
        self.assertIn("open_cmd", str(ctx.exception))

    def test_zero_value_warns_about_platform(self):
        scenario = parse_rule("barrier:state=2 то barrier:open_cmd=0",
                              self.catalog)
        self.assertTrue(any("0 платформа не пишет" in w
                            for w in scenario.warnings))

    def test_layout_mismatch_warns(self):
        scenario = parse_rule("barrier:state=9 то barrier:open_cmd=1",
                              self.catalog)
        self.assertTrue(any("вне словаря" in w for w in scenario.warnings))

    def test_value_with_space_or_colon_rejected(self):
        with self.assertRaises(ScenarioError):
            norm_value("про течка")
        with self.assertRaises(ScenarioError):
            norm_value("1:2")
        self.assertEqual(norm_value("1.0"), "1")
        self.assertEqual(norm_value(" 20 "), "20")

    def test_prefix_helpers(self):
        self.assertEqual(dict_name("leak"), "integrations_devices_leak")
        self.assertEqual(dict_name("integrations_devices_leak"),
                         "integrations_devices_leak")
        self.assertEqual(dict_name("leak", ""), "leak")
        self.assertEqual(short_name("integrations_devices_leak"), "leak")
        self.assertEqual(short_name("leak"), "leak")

    def test_scenario_id_from_any_response_shape(self):
        self.assertEqual(scenario_id({"result": 12}), 12)
        self.assertEqual(scenario_id({"id": "7"}), 7)
        self.assertEqual(scenario_id({"data": {"id": 9}}), 9)
        self.assertEqual(scenario_id({"error": 0, "dry_run": True}), 0)
        self.assertEqual(scenario_id(None), 0)

    def test_lax_mode_skips_catalog_checks(self):
        scenario = parse_rule("ghost:any=7 то ghost:other=1",
                              self.catalog, strict=False)
        self.assertEqual(scenario.trigger.sn, "ghost")
        self.assertEqual(scenario.condition(),
                         "when:device-ghost:integrations_devices_any=7")


class FakePlatform:
    dry_run = False

    def __init__(self):
        self.calls = []

    def autoscripts_edit(self, ust, scenario_id_value, scenario_type,
                         **kwargs):
        self.calls.append(("edit", ust, scenario_id_value, kwargs))
        return {"result": 77}

    def autoscripts_activate(self, ust, platform_id):
        self.calls.append(("activate", ust, platform_id))
        return {"error": 0}

    def autoscripts_list(self, ust):
        self.calls.append(("list", ust))
        return {"error": 0, "data": []}


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "scenarios.json"

    def test_ids_and_persistence(self):
        store = ScenarioStore(self.path)
        first = store.add({"title": "раз"})
        second = store.add({"title": "два"})
        self.assertEqual([first["id"], second["id"]], [1, 2])
        self.assertEqual(len(ScenarioStore(self.path).all()), 2)
        reopened = ScenarioStore(self.path)
        self.assertEqual(reopened.get(2)["title"], "два")
        reopened.update(1, enabled=False)
        self.assertFalse(ScenarioStore(self.path).get(1)["enabled"])
        reopened.remove(1)
        self.assertEqual([i["id"] for i in ScenarioStore(self.path).all()], [2])
        with self.assertRaises(ScenarioError):
            reopened.remove(99)

    def test_broken_file_is_empty_store(self):
        self.path.write_text("{не json", encoding="utf-8")
        self.assertEqual(ScenarioStore(self.path).all(), [])


class ServiceTest(CatalogCase):
    def setUp(self):
        super().setUp()
        self.client = UjinClient(dry_run=True, logger=lambda msg: None)
        self.store = ScenarioStore(Path(self.tmp.name) / "scenarios.json")
        self.service = ScenarioService(client=self.client, store=self.store,
                                       catalog=self.catalog,
                                       logger=lambda msg: None)

    def _edit_call(self):
        return [c for c in self.client.calls
                if c["path"] == "/api/autoscripts/edit/"][0]

    def test_create_dry_run_sends_platform_format(self):
        record = self.service.create(
            "если leak:leak=1 то barrier:open_cmd=1:60",
            title="Протечка → шлагбаум")
        self.assertEqual(record["mode"], "dry-run")
        self.assertEqual(record["platform_id"], 0)
        params = self._edit_call()["params"]
        self.assertEqual(params["condition"],
                         "when:device-111:integrations_devices_leak=1")
        self.assertEqual(params["set_signal"], "device-222:open_cmd:1:60")
        self.assertEqual(params["scenario_type"], "trigger")
        self.assertEqual(params["id"], 0)
        self.assertEqual(params["title"], "Протечка → шлагбаум")
        self.assertEqual(len(self.store.all()), 1)

    def test_title_is_generated_from_declarations(self):
        record = self.service.create(trigger="barrier:state=2",
                                     action="light:lamp=1")
        self.assertIn("Шлагбаум", record["title"])
        self.assertIn("Светильник", record["title"])

    def test_toggle_and_remove(self):
        record = self.service.create(trigger="barrier:state=2",
                                     action="light:lamp=1")
        self.service.toggle(record["id"], False)
        self.assertFalse(self.store.get(record["id"])["enabled"])
        self.service.remove(record["id"])
        self.assertEqual(self.store.all(), [])
        with self.assertRaises(ScenarioError):
            self.service.toggle(record["id"], True)

    def test_live_without_ust_refuses(self):
        client = UjinClient(dry_run=False, logger=lambda msg: None)
        service = ScenarioService(client=client, ust="", store=self.store,
                                  catalog=self.catalog, logger=lambda msg: None)
        with mock.patch.object(scenarios, "default_ust", return_value=""):
            with self.assertRaises(ScenarioError) as ctx:
                service.create(trigger="barrier:state=2",
                               action="light:lamp=1")
        self.assertIn("ust", str(ctx.exception))

    def test_live_creates_and_activates(self):
        platform = FakePlatform()
        service = ScenarioService(client=platform, ust="ust-1-abc",
                                  store=self.store, catalog=self.catalog,
                                  logger=lambda msg: None)
        record = service.create(trigger="barrier:state=2",
                                action="light:lamp=1")
        self.assertEqual(record["platform_id"], 77)
        self.assertEqual([c[0] for c in platform.calls], ["edit", "activate"])
        edit = platform.calls[0]
        self.assertEqual(edit[1], "ust-1-abc")
        self.assertEqual(edit[3]["set_signal"], "device-333:lamp:1")

    def test_live_create_off_does_not_activate(self):
        platform = FakePlatform()
        service = ScenarioService(client=platform, ust="ust-1-abc",
                                  store=self.store, catalog=self.catalog,
                                  logger=lambda msg: None)
        record = service.create(trigger="barrier:state=2",
                                action="light:lamp=1", enabled=False)
        self.assertFalse(record["enabled"])
        self.assertEqual([c[0] for c in platform.calls], ["edit"])

    def test_live_toggle_uses_platform_id(self):
        platform = FakePlatform()
        service = ScenarioService(client=platform, ust="ust-1-abc",
                                  store=self.store, catalog=self.catalog,
                                  logger=lambda msg: None)
        record = service.create(trigger="barrier:state=2",
                                action="light:lamp=1")
        service.toggle(record["id"], False)
        self.assertEqual(platform.calls[-1], ("activate", "ust-1-abc", 77))
        self.assertFalse(self.store.get(record["id"])["enabled"])

    def test_live_toggle_without_platform_id_refuses(self):
        platform = FakePlatform()
        service = ScenarioService(client=platform, ust="ust-1-abc",
                                  store=self.store, catalog=self.catalog,
                                  logger=lambda msg: None)
        record = self.store.add({"title": "старый", "platform_id": 0})
        with self.assertRaises(ScenarioError) as ctx:
            service.toggle(record["id"], True)
        self.assertIn("platform_id", str(ctx.exception))


class CliTest(CatalogCase):
    def _run(self, argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = scenarios.main(argv)
        return code, out.getvalue()

    def test_add_check_list(self):
        store = str(Path(self.tmp.name) / "cli.json")
        code, out = self._run(["add",
                               "если leak:leak=1 то barrier:open_cmd=1:60",
                               "--credentials", str(self.path),
                               "--store", store])
        self.assertEqual(code, 0)
        self.assertIn("сценарий #1 сохранён", out)
        self.assertIn("when:device-111:integrations_devices_leak=1", out)

        code, out = self._run(["list", "--credentials", str(self.path),
                               "--store", store])
        self.assertEqual(code, 0)
        self.assertIn("#1", out)
        self.assertIn("вкл", out)

        code, out = self._run(["off", "1", "--credentials", str(self.path),
                               "--store", store])
        self.assertEqual(code, 0)
        code, out = self._run(["list", "--credentials", str(self.path),
                               "--store", store])
        self.assertIn("выкл", out)

        code, out = self._run(["remove", "1", "--credentials", str(self.path),
                               "--store", store])
        self.assertEqual(code, 0)
        self.assertIn("убран", out)

    def test_check_reports_rule_error(self):
        store = str(Path(self.tmp.name) / "cli.json")
        code, out = self._run(["check", "barrier:state=2",
                               "--credentials", str(self.path),
                               "--store", store])
        self.assertEqual(code, 2)
        self.assertIn("ошибка", out)
        self.assertIn("то", out)

    def test_devices_lists_signals(self):
        code, out = self._run(["devices", "--credentials", str(self.path),
                               "--store", str(Path(self.tmp.name) / "x.json")])
        self.assertEqual(code, 0)
        self.assertIn("open_cmd", out)
        self.assertIn("sn=222", out)


class WebTest(CatalogCase):
    def setUp(self):
        super().setUp()
        self.client = UjinClient(dry_run=True, logger=lambda msg: None)
        self.store = ScenarioStore(Path(self.tmp.name) / "web.json")
        self.service = ScenarioService(client=self.client, store=self.store,
                                       catalog=self.catalog,
                                       logger=lambda msg: None)
        self.server = scenario_editor.make_server(self.service, port=0)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def _url(self, path):
        return f"http://127.0.0.1:{self.server.server_address[1]}{path}"

    def _get(self, path):
        with urllib.request.urlopen(self._url(path), timeout=5) as resp:
            return resp.read().decode("utf-8")

    def _post(self, path, data):
        body = urllib.parse.urlencode(data).encode("utf-8")
        request = urllib.request.Request(self._url(path), data=body,
                                         method="POST")
        request.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(request, timeout=5) as resp:
            return resp.read().decode("utf-8")

    def test_index_has_constructor_and_catalog(self):
        page = self._get("/")
        self.assertIn("Сценарии умного дома", page)
        self.assertIn("trigger_sn", page)
        self.assertIn("action_value_wrap", page)
        self.assertIn("barrier_01", page)
        self.assertIn("dry-run", page)

    def test_catalog_api(self):
        payload = json.loads(self._get("/api/catalog"))
        self.assertEqual(len(payload["devices"]), 3)
        barrier = [d for d in payload["devices"] if d["sn"] == "222"][0]
        self.assertIn("open_cmd", [s["name"] for s in barrier["signals"]])

    def test_healthz(self):
        self.assertEqual(json.loads(self._get("/healthz"))["ok"], True)

    def test_add_via_form(self):
        page = self._post("/add", {
            "title": "Протечка → шлагбаум",
            "trigger_sn": "111", "trigger_signal": "leak",
            "trigger_value": "1",
            "action_sn": "222", "action_signal": "open_cmd",
            "action_value": "1", "hold": "60", "enabled": "on"})
        self.assertIn("создан", page)
        self.assertEqual(len(self.store.all()), 1)
        record = self.store.all()[0]
        self.assertEqual(record["condition"],
                         "when:device-111:integrations_devices_leak=1")
        self.assertEqual(record["set_signal"], "device-222:open_cmd:1:60")
        self.assertTrue(record["enabled"])

    def test_add_via_rule_text(self):
        page = self._post("/add", {
            "rule": "barrier:state=2 -> light:lamp=1:30",
            "hold": "0", "enabled": "on"})
        self.assertIn("создан", page)
        record = self.store.all()[0]
        self.assertEqual(record["condition"],
                         "when:device-222:integrations_devices_state=2")
        self.assertEqual(record["set_signal"], "device-333:lamp:1:30")

    def test_add_error_is_shown(self):
        page = self._post("/add", {"rule": "barrier:state=2",
                                  "hold": "0", "enabled": "on"})
        self.assertIn("не нашёл", page)
        self.assertEqual(self.store.all(), [])

    def test_toggle_and_delete(self):
        self._post("/add", {"trigger_sn": "111", "trigger_signal": "leak",
                            "trigger_value": "1",
                            "action_sn": "222", "action_signal": "open_cmd",
                            "action_value": "1", "hold": "0",
                            "enabled": "on"})
        self.assertIn("выключен", self._post("/toggle",
                                             {"id": "1", "enabled": "0"}))
        self.assertFalse(self.store.get(1)["enabled"])
        self.assertIn("убран", self._post("/delete", {"id": "1"}))
        self.assertEqual(self.store.all(), [])

    def test_unknown_page_is_404(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self._get("/missing")
        self.assertEqual(ctx.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
