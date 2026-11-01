var saved = localStorage.getItem('myUser');

if (!saved) {
    location.href = 'register.html';
}

var user = JSON.parse(saved);

if (user.isAdmin != true && user.hasPermission != true) {
    location.href = 'domik.html';
}

var logoutButton = document.querySelector('.knopka4');
var addButton = document.querySelector('.dt_cr');

logoutButton.onclick = function() {
    localStorage.removeItem('myUser');
    location.href = 'register.html';
};

addButton.onclick = function() {
    var name = document.getElementById('name').value;
    var type = document.getElementById('type').value;
    var unit = document.getElementById('ed').value;

    if (name == '' || type == '') {
        alert('Заполните имя и тип датчика');
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
