var saved = localStorage.getItem('myUser');

if (!saved) {
    location.href = 'register.html';
}

var user = JSON.parse(saved);
var requestButton = document.querySelector('.knopechka');
var title = document.querySelector('.text67');
var logoutButton = document.querySelector('.knopka4');

title.innerText = 'Добро пожаловать, ' + user.login + '!';

var mainBox = document.querySelector('.cont2');
var homeDevicesBox = document.createElement('div');
homeDevicesBox.style.cssText = 'margin-top: 20px; max-height: 420px; overflow-y: auto;';
mainBox.appendChild(homeDevicesBox);

function renderHomeDevices(devices) {
    var html = '<div style="font-size: 24px; text-align: center; margin-top: 10px;">Мои датчики</div>';

    if (devices.length == 0) {
        html += '<div style="text-align: center; margin-top: 20px; font-size: 18px;">Датчиков пока нет</div>';
    }

    for (var i = 0; i < devices.length; i++) {
        html += '<div style="background: gray; color: white; border-radius: 50px; padding: 12px 20px; margin: 8px 30px; text-align: center; font-size: 18px;">' + devices[i].name + ' — ' + devices[i].status + '</div>';
    }

    homeDevicesBox.innerHTML = html;
}

function loadHomeDevices() {
    if (user.isAdmin != true && user.hasPermission != true) {
        homeDevicesBox.innerHTML = '<div style="font-size: 24px; text-align: center; margin-top: 10px;">Мои датчики</div><div style="text-align: center; margin-top: 20px; font-size: 18px;">Устройства появятся после одобрения заявки</div>';
        return;
    }

    fetch('/api/devices?token=' + encodeURIComponent(user.token)).then(function(response) {
        return response.json();
    }).then(function(devices) {
        renderHomeDevices(devices);
    });
}

logoutButton.onclick = function() {
    localStorage.removeItem('myUser');
    location.href = 'register.html';
};

function sendRequest() {
    fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: user.login })
    }).then(function(response) {
        return response.json();
    }).then(function(data) {
        if (data.success == false) {
            alert(data.message);
        } else {
            alert('Заявка отправлена в УК');
        }
        showButton();
    });
}

function showButton() {
    if (user.hasPermission == true) {
        requestButton.innerText = 'Доступ к устройствам открыт';
        requestButton.disabled = true;
        return;
    }

    fetch('/api/requests').then(function(response) {
        return response.json();
    }).then(function(list) {
        var pending = false;

        for (var i = 0; i < list.length; i++) {
            if (list[i].login == user.login && list[i].status == 'pending') {
                pending = true;
            }
        }

        if (pending == true) {
            requestButton.innerText = 'Заявка отправлена';
            requestButton.disabled = true;
        } else {
            requestButton.innerText = 'Отправить запрос';
            requestButton.disabled = false;
            requestButton.onclick = sendRequest;
        }
    });
}

function loadMe() {
    fetch('/api/me?login=' + encodeURIComponent(user.login)).then(function(response) {
        return response.json();
    }).then(function(data) {
        user.isAdmin = user.isAdmin == true || data.isAdmin == true;
        user.hasPermission = data.hasPermission == true;
        localStorage.setItem('myUser', JSON.stringify(user));
        showButton();
        loadHomeDevices();
    });
}

showButton();
loadMe();
loadHomeDevices();
setInterval(loadMe, 2000);
setInterval(loadHomeDevices, 2000);
