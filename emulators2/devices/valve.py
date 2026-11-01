"""Клапан — семейство `valve` (заготовка new_device.py).

Три группы: 📊 свойство (читаю) / 🎛 возможность (управляю) / ⚙️ настройка.
Правь сигналы, `tick()` и `on_command()` под своё железо.
"""
from __future__ import annotations

from core import Device, Signal


class ValveDevice(Device):
    model = "emul_valve"
    title = "Клапан"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.add_signal(Signal('lamp', 'Свет', 'switch', 'rw', 'capability', 0, ''))
        self.add_signal(Signal('brightness', 'Яркость', 'range', 'rw', 'capability', 100, '%', 1, 100))
        self.add_signal(Signal('power_w', 'Мощность', 'graph', 'r', 'property', 0.0, 'Вт'))
        self.add_signal(Signal('energy_kwh', 'Энергия', 'counter', 'r', 'property', 0.0, 'кВт·ч'))
        self.add_signal(Signal('offline_timeout', 'Авто-выкл через, с (0=выкл)', 'counter', 'rw', 'setting', 0, 'с', 0, 3600))

    def on_command(self, name, value) -> None:
        """TODO: реакция на команды (изменения rw/w сигналов)."""
        pass

    def tick(self, dt: int) -> None:
        """TODO: твоя физика. Пример: числовые свойства дрейфуют."""
        for s in self.signals.values():
            if s.group == "property" and isinstance(s.value, (int, float)):
                self.set_value(s.name, s.value + dt * 0)
