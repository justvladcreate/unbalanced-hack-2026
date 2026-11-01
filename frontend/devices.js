var saved = localStorage.getItem('myUser');

if (!saved) {
    location.href = 'register.html';
}

var user = JSON.parse(saved);
var logoutButton = document.querySelector('.knopka4');
var devices = [];
var selectedTypes = {};
var selectedStatuses = { OK: true, ERROR: true };

if (user.isAdmin != true && user.hasPermission != true) {
    location.href = 'domik.html';
}

logoutButton.onclick = function() {
    localStorage.removeItem('myUser');
    location.href = 'register.html';
};

function getDeviceClass(type) {
    if (type == 'barrier') {
        return 'barrier';
    }
    if (type == 'counter') {
        return 'counter';
    }
    if (type == 'elevator') {
        return 'elevator';
    }
    if (type == 'fire') {
        return 'fire';
    }
    if (type == 'leak_hub') {
        return 'leak_hub';
    }
    if (type == 'leak_sensor') {
        return 'leak_sensor';
    }
    if (type == 'thermostat') {
        return 'thermostat';
    }
    if (type == 'ventilation') {
        return 'ventilation';
    }
    return 'light';
}

function drawDevices() {
    var box = document.querySelector('.cont4helper');
    box.innerHTML = '';
    var count = 0;

    for (var i = 0; i < devices.length; i++) {
        if (selectedTypes[devices[i].type] == false) {
            continue;
        }
        if (selectedStatuses[devices[i].status] == false) {
            continue;
        }

        var row = document.createElement('div');
        row.className = getDeviceClass(devices[i].type);
        row.innerText = devices[i].name + ' — ' + devices[i].status;
        row.onclick = function(device) {
            return function() {
                if (typeof showChart == 'function') {
                    showChart(device);
                }
            };
        }(devices[i]);
        box.appendChild(row);
        count = count + 1;
    }

    if (count == 0) {
        box.innerHTML = '<div class="light">Ничего не найдено</div>';
    }
}

function openFilters() {
    var oldWindow = document.getElementById('filter-window');

    if (oldWindow) {
        oldWindow.remove();
    }

    var types = [];

    for (var i = 0; i < devices.length; i++) {
        if (types.indexOf(devices[i].type) < 0) {
            types.push(devices[i].type);
        }
    }

    var html = '<div id="filter-window" style="position: fixed; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.35); display: flex; align-items: center; justify-content: center; z-index: 10;">';
    html += '<div style="background: white; border-radius: 30px; padding: 30px; width: 360px; max-width: 90%; display: flex; flex-direction: column; gap: 12px;">';
    html += '<div style="font-size: 30px; text-align: center;">Фильтры</div>';
    html += '<div>Тип датчика</div>';

    for (var j = 0; j < types.length; j++) {
        var checked = '';

        if (selectedTypes[types[j]] != false) {
            checked = 'checked';
        }

        html += '<label><input type="checkbox" class="filter-type" value="' + types[j] + '" ' + checked + '> ' + types[j] + '</label>';
    }

    html += '<div>Состояние</div>';

    var statuses = ['OK', 'ERROR'];

    for (var k = 0; k < statuses.length; k++) {
        var statusChecked = '';

        if (selectedStatuses[statuses[k]] != false) {
            statusChecked = 'checked';
        }

        html += '<label><input type="checkbox" class="filter-status" value="' + statuses[k] + '" ' + statusChecked + '> ' + statuses[k] + '</label>';
    }

    html += '<div style="display: flex; gap: 10px; margin-top: 10px;">';
    html += '<button id="apply-filters" style="flex: 1; height: 45px; border: none; border-radius: 50px; background: gray; color: white; cursor: pointer;">Применить</button>';
    html += '<button id="close-filters" style="flex: 1; height: 45px; border: none; border-radius: 50px; background: gray; color: white; cursor: pointer;">Закрыть</button>';
    html += '</div></div></div>';

    var windowBox = document.createElement('div');
    windowBox.innerHTML = html;
    document.body.appendChild(windowBox);

    document.getElementById('close-filters').onclick = function() {
        document.getElementById('filter-window').remove();
    };

    document.getElementById('apply-filters').onclick = function() {
        var typeBoxes = document.querySelectorAll('.filter-type');

        for (var i = 0; i < typeBoxes.length; i++) {
            selectedTypes[typeBoxes[i].value] = typeBoxes[i].checked;
        }

        var statusBoxes = document.querySelectorAll('.filter-status');

        for (var j = 0; j < statusBoxes.length; j++) {
            selectedStatuses[statusBoxes[j].value] = statusBoxes[j].checked;
        }

        document.getElementById('filter-window').remove();
        drawDevices();
    };
}

var firstLoad = true;

function loadDevices() {
    fetch('/api/devices?token=' + encodeURIComponent(user.token)).then(function(response) {
        return response.json();
    }).then(function(list) {
        devices = list;

        for (var i = 0; i < devices.length; i++) {
            if (selectedTypes[devices[i].type] == undefined) {
                selectedTypes[devices[i].type] = true;
            }
        }

        if (firstLoad == true) {
            var filterBox = document.querySelector('.cont3');
            filterBox.innerHTML = '<button id="open-filters" style="width: 100%; height: 100%; border: none; border-radius: 50px; background: gray; color: white; font-size: 20px; cursor: pointer;">Фильтры</button>';

            document.getElementById('open-filters').onclick = openFilters;
            firstLoad = false;
            drawDevices();
        } else {
            drawDevices();
        }
    });
}

loadDevices();
setInterval(loadDevices, 2000);
