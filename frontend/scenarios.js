var scenarioUser = JSON.parse(localStorage.getItem('myUser') || '{}');
var scenarioDevices = [];
var scenarioItems = [];
var scenarioProjectId = 0;
var scenarioEditingId = 0;
var scenarioPanel = null;

function scenarioRequest(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers['Authorization'] = 'Bearer ' + scenarioUser.token;
    return fetch(url, options);
}

function fillScenarioSignals() {
    var deviceSelect = document.getElementById('scenario-device');
    var signalSelect = document.getElementById('scenario-signal');
    var device = scenarioDevices[deviceSelect.value];

    signalSelect.innerHTML = '';

    if (!device || !device.declaration) {
        return;
    }

    for (var i = 0; i < device.declaration.length; i++) {
        var option = document.createElement('option');
        option.value = device.declaration[i].name;
        option.innerText = device.declaration[i].title;
        signalSelect.appendChild(option);
    }
}

function fillActionSignals() {
    var deviceSelect = document.getElementById('scenario-action-device');
    var signalSelect = document.getElementById('scenario-action-signal');

    signalSelect.innerHTML = '';

    if (deviceSelect.value == '') {
        return;
    }

    var device = scenarioDevices[deviceSelect.value];

    if (!device || !device.declaration) {
        return;
    }

    for (var i = 0; i < device.declaration.length; i++) {
        var signal = device.declaration[i];

        if (signal.management == 'rw' || signal.management == 'w') {
            var option = document.createElement('option');
            option.value = signal.name;
            option.innerText = signal.title;
            signalSelect.appendChild(option);
        }
    }
}

function loadScenarioList() {
    var box = document.getElementById('scenario-list');

    if (!box || scenarioProjectId == 0) {
        return;
    }

    scenarioRequest('http://localhost:8000/api/v1/smart_house/' + scenarioProjectId).then(function(response) {
        return response.json();
    }).then(function(project) {
        scenarioItems = project.scenarios || [];
        box.innerHTML = '';

        if (scenarioItems.length == 0) {
            box.innerText = 'Сценариев пока нет';
            return;
        }

        for (var i = 0; i < scenarioItems.length; i++) {
            var scenario = scenarioItems[i];
            var row = document.createElement('div');
            row.style.cssText = 'background: whitesmoke; border-radius: 20px; padding: 8px; margin-top: 6px;';
            row.innerHTML = '<div>' + scenario.title + '</div>' +
                '<div>' + scenario.trigger_signal + ' = ' + scenario.trigger_value + '</div>' +
                '<button onclick="editScenario(' + scenario.id + ')">Изменить</button> ' +
                '<button onclick="deleteScenario(' + scenario.id + ')">Удалить</button>';
            box.appendChild(row);
        }
    });
}

function editScenario(id) {
    var scenario = null;

    for (var i = 0; i < scenarioItems.length; i++) {
        if (scenarioItems[i].id == id) {
            scenario = scenarioItems[i];
        }
    }

    if (!scenario) {
        return;
    }

    scenarioEditingId = id;
    document.getElementById('scenario-title').value = scenario.title;
    document.getElementById('scenario-value').value = scenario.trigger_value;
    document.getElementById('scenario-text').value = scenario.notifications_text;
    document.getElementById('scenario-save').innerText = 'Сохранить сценарий';

    var deviceSelect = document.getElementById('scenario-device');

    for (var j = 0; j < scenarioDevices.length; j++) {
        if (scenarioDevices[j].ext_id == scenario.trigger_device_id) {
            deviceSelect.value = j;
        }
    }

    fillScenarioSignals();
    document.getElementById('scenario-signal').value = scenario.trigger_signal;

    var actionSelect = document.getElementById('scenario-action-device');
    actionSelect.value = '';

    for (var k = 0; k < scenarioDevices.length; k++) {
        if (scenarioDevices[k].ext_id == scenario.action_device_id) {
            actionSelect.value = k;
        }
    }

    fillActionSignals();

    if (scenario.action_signal) {
        document.getElementById('scenario-action-signal').value = scenario.action_signal;
    }

    document.getElementById('scenario-action-value').value = scenario.action_value || '';
}

function deleteScenario(id) {
    if (!confirm('Удалить сценарий?')) {
        return;
    }

    scenarioRequest('http://localhost:8000/api/v1/smart_house/' + scenarioProjectId + '/scenarios/' + id, {
        method: 'DELETE'
    }).then(function(response) {
        return response.json();
    }).then(function() {
        loadScenarioList();
    });
}

function resetScenarioForm() {
    scenarioEditingId = 0;
    document.getElementById('scenario-title').value = '';
    document.getElementById('scenario-value').value = '';
    document.getElementById('scenario-text').value = '';
    document.getElementById('scenario-action-value').value = '';
    document.getElementById('scenario-action-device').value = '';
    document.getElementById('scenario-action-signal').innerHTML = '';
    document.getElementById('scenario-save').innerText = 'Добавить сценарий';
}

function runScenarios() {
    scenarioRequest('http://localhost:8000/api/v1/smart_house/' + scenarioProjectId + '/tick?steps=1', {
        method: 'POST'
    }).then(function(response) {
        return response.json();
    }).then(function(project) {
        if (!project.devices) {
            alert('Не получилось проверить сценарии');
            return;
        }

        alert('Сценарии проверены');
        loadScenarioList();
    });
}

function saveScenario() {
    var title = document.getElementById('scenario-title').value;
    var deviceIndex = document.getElementById('scenario-device').value;
    var signal = document.getElementById('scenario-signal').value;
    var value = document.getElementById('scenario-value').value;
    var text = document.getElementById('scenario-text').value;
    var actionIndex = document.getElementById('scenario-action-device').value;
    var actionSignal = document.getElementById('scenario-action-signal').value;
    var actionValue = document.getElementById('scenario-action-value').value;
    var device = scenarioDevices[deviceIndex];
    var actionDevice = null;

    if (actionIndex != '') {
        actionDevice = scenarioDevices[actionIndex];
    }

    if (!title || !device || !signal) {
        alert('Заполните название, датчик и сигнал');
        return;
    }

    var body = {
        title: title,
        trigger_device_id: device.ext_id,
        trigger_signal: signal,
        trigger_value: value,
        action_device_id: actionDevice ? actionDevice.ext_id : '',
        action_signal: actionDevice ? actionSignal : '',
        action_value: actionDevice ? actionValue : 0,
        notifications_text: text
    };

    var url = 'http://localhost:8000/api/v1/smart_house/' + scenarioProjectId + '/scenarios';
    var method = 'POST';

    if (scenarioEditingId != 0) {
        url = url + '/' + scenarioEditingId;
        method = 'PUT';
    }

    scenarioRequest(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function(response) {
        return response.json();
    }).then(function(project) {
        if (!project.scenarios) {
            alert('Не получилось сохранить сценарий');
            return;
        }

        alert('Сценарий сохранён');
        resetScenarioForm();
        loadScenarioList();
    });
}

function showScenarioPanel() {
    if (scenarioPanel) {
        scenarioPanel.remove();
        scenarioPanel = null;
        return;
    }

    scenarioPanel = document.createElement('div');
    scenarioPanel.style.cssText = 'position: fixed; top: 120px; left: 120px; width: 380px; max-height: 520px; overflow-y: auto; background: white; border-radius: 25px; padding: 20px; z-index: 20; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);';
    scenarioDevices = [];
    scenarioItems = [];
    scenarioProjectId = 0;
    scenarioEditingId = 0;
    scenarioPanel.innerHTML = '<div style="font-size: 24px; text-align: center;">Сценарии</div>' +
        '<div style="margin-top: 10px;">Название</div>' +
        '<input id="scenario-title" style="width: 100%; box-sizing: border-box; padding: 8px; border-radius: 20px; border: 1px solid gray;">' +
        '<div style="margin-top: 10px;">Датчик</div>' +
        '<select id="scenario-device" style="width: 100%; padding: 8px; border-radius: 20px;"></select>' +
        '<div style="margin-top: 10px;">Сигнал</div>' +
        '<select id="scenario-signal" style="width: 100%; padding: 8px; border-radius: 20px;"></select>' +
        '<div style="margin-top: 10px;">Значение</div>' +
        '<input id="scenario-value" style="width: 100%; box-sizing: border-box; padding: 8px; border-radius: 20px; border: 1px solid gray;">' +
        '<div style="margin-top: 10px;">Действие</div>' +
        '<select id="scenario-action-device" style="width: 100%; padding: 8px; border-radius: 20px;"><option value="">нет</option></select>' +
        '<div style="margin-top: 10px;">Сигнал действия</div>' +
        '<select id="scenario-action-signal" style="width: 100%; padding: 8px; border-radius: 20px;"></select>' +
        '<div style="margin-top: 10px;">Значение действия</div>' +
        '<input id="scenario-action-value" style="width: 100%; box-sizing: border-box; padding: 8px; border-radius: 20px; border: 1px solid gray;">' +
        '<div style="margin-top: 10px;">Уведомление</div>' +
        '<input id="scenario-text" style="width: 100%; box-sizing: border-box; padding: 8px; border-radius: 20px; border: 1px solid gray;">' +
        '<button id="scenario-save" style="width: 100%; height: 40px; margin-top: 15px; border: none; border-radius: 50px; background: gray; color: white; cursor: pointer;">Добавить сценарий</button>' +
        '<button id="scenario-run" style="width: 100%; height: 40px; margin-top: 10px; border: none; border-radius: 50px; background: gray; color: white; cursor: pointer;">Проверить сценарии</button>' +
        '<div id="scenario-list" style="margin-top: 15px;"></div>' +
        '<button id="scenario-logout" style="width: 100%; height: 40px; margin-top: 15px; border: none; border-radius: 50px; background: gray; color: white; cursor: pointer;">Выйти</button>';

    document.body.appendChild(scenarioPanel);

    fetch('/api/devices?token=' + encodeURIComponent(scenarioUser.token)).then(function(response) {
        return response.json();
    }).then(function(list) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].project_id && list[i].ext_id) {
                scenarioDevices.push(list[i]);
            }
        }

        if (scenarioDevices.length == 0) {
            document.getElementById('scenario-list').innerText = 'Сначала добавьте устройство';
            return;
        }

        scenarioProjectId = scenarioDevices[0].project_id;

        var deviceSelect = document.getElementById('scenario-device');
        var actionSelect = document.getElementById('scenario-action-device');

        for (var j = 0; j < scenarioDevices.length; j++) {
            var option = document.createElement('option');
            option.value = j;
            option.innerText = scenarioDevices[j].name;
            deviceSelect.appendChild(option);

            var actionOption = document.createElement('option');
            actionOption.value = j;
            actionOption.innerText = scenarioDevices[j].name;
            actionSelect.appendChild(actionOption);
        }

        fillScenarioSignals();
        loadScenarioList();
    });

    document.getElementById('scenario-device').onchange = fillScenarioSignals;
    document.getElementById('scenario-action-device').onchange = fillActionSignals;
    document.getElementById('scenario-save').onclick = saveScenario;
    document.getElementById('scenario-run').onclick = runScenarios;

    document.getElementById('scenario-logout').onclick = function() {
        localStorage.removeItem('myUser');
        location.href = 'register.html';
    };
}

document.querySelector('.knopka4').onclick = showScenarioPanel;
