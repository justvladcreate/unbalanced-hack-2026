var controlsUser = JSON.parse(localStorage.getItem('myUser') || '{}');

function setupControls() {
    var box = document.querySelector('.cont2');

    if (!box) {
        return;
    }

    var panel = document.createElement('div');
    panel.id = 'device-controls';
    panel.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; padding: 10px;';
    box.appendChild(panel);
}

function sendCommand(device, signal, value) {
    fetch('http://localhost:8000/api/v1/smart_house/' + device.project_id + '/devices/' + device.ext_id + '/command', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + controlsUser.token
        },
        body: JSON.stringify({ signal: signal, value: value })
    }).then(function(response) {
        return response.json();
    }).then(function() {
        alert('Команда отправлена');
        refreshChart();
    });
}

function addControl(panel, device, signal) {
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; align-items: center; gap: 6px; background: whitesmoke; border-radius: 50px; padding: 6px 10px;';

    var label = document.createElement('span');
    label.innerText = signal.title;
    wrapper.appendChild(label);

    var input;

    if (signal.control == 'list') {
        input = document.createElement('select');

        for (var key in signal.layout) {
            var option = document.createElement('option');
            option.value = key;
            option.innerText = signal.layout[key];
            input.appendChild(option);
        }

        input.value = String(device.state[signal.name]);
    } else if (signal.control == 'range') {
        input = document.createElement('input');
        input.type = 'range';
        input.min = signal.min || 0;
        input.max = signal.max || 100;
        input.value = device.state[signal.name];
    } else if (signal.control == 'switch') {
        input = document.createElement('select');
        input.innerHTML = '<option value="0">Выкл</option><option value="1">Вкл</option>';
        input.value = String(device.state[signal.name]);
    } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = device.state[signal.name];
    }

    wrapper.appendChild(input);

    var button = document.createElement('button');
    button.innerText = 'Отправить';
    button.style.cssText = 'border: none; border-radius: 50px; padding: 6px 12px; background: gray; color: white; cursor: pointer;';
    button.onclick = function() {
        var value = input.value;

        if (signal.control == 'range' || signal.control == 'switch') {
            value = Number(input.value);
        }

        sendCommand(device, signal.name, value);
    };

    wrapper.appendChild(button);
    panel.appendChild(wrapper);
}

function tickDevice(device) {
    fetch('http://localhost:8000/api/v1/smart_house/' + device.project_id + '/devices/' + device.ext_id + '/tick?steps=1', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + controlsUser.token
        }
    }).then(function(response) {
        return response.json();
    }).then(function() {
        alert('Эмулятор обновился');
        refreshChart();
    });
}

function showControls(device) {
    var panel = document.getElementById('device-controls');

    if (!panel) {
        return;
    }

    panel.innerHTML = '';

    if (!device || !device.declaration || !device.project_id) {
        panel.innerText = 'Управление недоступно';
        return;
    }

    var tickButton = document.createElement('button');
    tickButton.innerText = 'Шаг эмулятора';
    tickButton.style.cssText = 'border: none; border-radius: 50px; padding: 6px 12px; background: gray; color: white; cursor: pointer;';
    tickButton.onclick = function() {
        tickDevice(device);
    };
    panel.appendChild(tickButton);

    var count = 0;

    for (var i = 0; i < device.declaration.length; i++) {
        var signal = device.declaration[i];

        if (signal.management == 'rw' || signal.management == 'w') {
            addControl(panel, device, signal);
            count = count + 1;
        }
    }

    if (count == 0) {
        var text = document.createElement('span');
        text.innerText = 'Нет управляемых сигналов';
        panel.appendChild(text);
    }
}

setupControls();
