var saved = localStorage.getItem('myUser');

if (!saved) {
    location.href = 'register.html';
}

var user = JSON.parse(saved);
var deviceTypes = [];

if (user.isAdmin != true && user.hasPermission != true) {
    location.href = 'domik.html';
}

var logoutButton = document.querySelector('.knopka4');
var addButton = document.querySelector('.dt_cr');
var typeSelect = document.getElementById('type');
var unitSelect = document.getElementById('ed');

logoutButton.onclick = function() {
    localStorage.removeItem('myUser');
    location.href = 'register.html';
};

function fillUnits() {
    var selectedType = typeSelect.value;
    var measures = [];

    unitSelect.innerHTML = '<option value="">Ед. измерения</option>';

    for (var i = 0; i < deviceTypes.length; i++) {
        if (deviceTypes[i].family == selectedType) {
            measures = deviceTypes[i].measures;
        }
    }

    for (var j = 0; j < measures.length; j++) {
        var option = document.createElement('option');
        option.value = measures[j];
        option.innerText = measures[j];
        unitSelect.appendChild(option);
    }
}

function loadDeviceTypes() {
    fetch('http://localhost:8000/api/v1/smart_house/device-types').then(function(response) {
        return response.json();
    }).then(function(types) {
        deviceTypes = types;

        for (var i = 0; i < types.length; i++) {
            var option = document.createElement('option');
            option.value = types[i].family;
            option.innerText = types[i].title;
            typeSelect.appendChild(option);
        }
    });
}

typeSelect.onchange = fillUnits;

addButton.onclick = function() {
    var name = document.getElementById('name').value;
    var type = typeSelect.value;
    var unit = unitSelect.value;
    var selectedType = null;

    for (var i = 0; i < deviceTypes.length; i++) {
        if (deviceTypes[i].family == type) {
            selectedType = deviceTypes[i];
        }
    }

    if (name == '') {
        alert('Введите имя датчика');
        return;
    }

    if (!selectedType) {
        alert('Выберите тип датчика из списка');
        return;
    }

    if (!unit) {
        alert('Выберите единицу измерения');
        return;
    }

    if (selectedType.measures.indexOf(unit) < 0) {
        alert('Такой единицы измерения нет у этого типа');
        return;
    }

    fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, type: type, unit: unit, token: user.token })
    }).then(function(response) {
        return response.json();
    }).then(function() {
        alert('Датчик добавлен');
        location.href = 'datchik.html';
    });
};

loadDeviceTypes();
