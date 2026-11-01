var scenarioUser = JSON.parse(localStorage.getItem('myUser') || '{}');
var scenarioDevices = [];
var scenarioProjectId = 0;
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

function loadScenarioList() {
    var box = document.getElementById('scenario-list');

    if (!box || scenarioProjectId == 0) {
        return;
    }

    scenarioRequest('http://localhost:8000/api/v1/smart_house/' + scenarioProjectId).then(function(response) {
        return response.json();
    }).then(function(project) {
        box.innerHTML = '';

        if (!project.scenarios || project.scenarios.length == 0) {
            box.innerText = 'Сценариев пока нет';
            return;
        }

        for (var i = 0; i < project.scenarios.length; i++) {
            var row = document.createElement('div');
            row.style.cssText = 'background: whitesmoke; border-radius: 20px; padding: 8px; margin-top: 6px;';
            row.innerText = project.scenarios[i].title + ' — ' + project.scenarios[i].trigger_signal + ' = ' + project.scenarios[i].trigger_value;
            box.appendChild(row);
        }
    });
}

function saveScenario() {
    var title = document.getElementById('scenario-title').value;
    var deviceIndex = document.getElementById('scenario-device').value;
    var signal = document.getElementById('scenario-signal').value;
    var value = document.getElementById('scenario-value').value;
    var text = document.getElementById('scenario-text').value;
    var device = scenarioDevices[deviceIndex];

    if (!title || !device || !signal) {
        alert('Заполните название, датчик и сигнал');
        return;
    }

    var body = {
        title: title,
        trigger_device_id: device.ext_id,
        trigger_signal: signal,
        trigger_value: value,
        action_device_id: '',
        action_signal: '',
        action_value: 0,
        notifications_text: text
    };

    scenarioRequest('http://localhost:8000/api/v1/smart_house/' + scenarioProjectId + '/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function(response) {
        return response.json();
    }).then(function() {
        alert('Сценарий добавлен');
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
    scenarioProjectId = 0;
    scenarioPanel.innerHTML = '<div style="font-size: 24px; text-align: center;">Сценарии</div>' +
        '<div style="margin-top: 10px;">Название</div>' +
        '<input id="scenario-title" style="width: 100%; box-sizing: border-box; padding: 8px; border-radius: 20px; border: 1px solid gray;">' +
        '<div style="margin-top: 10px;">Датчик</div>' +
        '<select id="scenario-device" style="width: 100%; padding: 8px; border-radius: 20px;"></select>' +
        '<div style="margin-top: 10px;">Сигнал</div>' +
        '<select id="scenario-signal" style="width: 100%; padding: 8px; border-radius: 20px;"></select>' +
        '<div style="margin-top: 10px;">Значение</div>' +
        '<input id="scenario-value" style="width: 100%; box-sizing: border-box; padding: 8px; border-radius: 20px; border: 1px solid gray;">' +
        '<div style="margin-top: 10px;">Уведомление</div>' +
        '<input id="scenario-text" style="width: 100%; box-sizing: border-box; padding: 8px; border-radius: 20px; border: 1px solid gray;">' +
        '<button id="scenario-save" style="width: 100%; height: 40px; margin-top: 15px; border: none; border-radius: 50px; background: gray; color: white; cursor: pointer;">Добавить сценарий</button>' +
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

        var deviceSelect = document.getElementById('scenario-device');

        if (scenarioDevices.length == 0) {
            document.getElementById('scenario-list').innerText = 'Сначала добавьте устройство';
            return;
        }

        scenarioProjectId = scenarioDevices[0].project_id;

        for (var j = 0; j < scenarioDevices.length; j++) {
            var option = document.createElement('option');
            option.value = j;
            option.innerText = scenarioDevices[j].name;
            deviceSelect.appendChild(option);
        }

        fillScenarioSignals();
        loadScenarioList();
    });

    document.getElementById('scenario-device').onchange = fillScenarioSignals;

    document.getElementById('scenario-save').onclick = saveScenario;

    document.getElementById('scenario-logout').onclick = function() {
        localStorage.removeItem('myUser');
        location.href = 'register.html';
    };
}

document.querySelector('.knopka4').onclick = showScenarioPanel;
