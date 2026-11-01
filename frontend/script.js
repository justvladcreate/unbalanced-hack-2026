var API = 'http://localhost:3000/api';
var myToken = '';
var myLogin = '';
var amIAdmin = false;
var myPermission = false;

window.onload = function() {
    var saved = localStorage.getItem('myUser');
    if (saved) {
        var obj = JSON.parse(saved);
        myToken = obj.token;
        myLogin = obj.login;
        amIAdmin = obj.isAdmin;
        myPermission = obj.hasPermission;
        openMain();
    }
}

function showReg() {
    document.getElementById('auth-block').style.display = 'none';
    document.getElementById('reg-block').style.display = 'block';
}

function hideReg() {
    document.getElementById('auth-block').style.display = 'block';
    document.getElementById('reg-block').style.display = 'none';
}

function doRegister() {
    var l = document.getElementById('reg-login').value;
    var p = document.getElementById('reg-pass').value;
    fetch(API + '/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: l, password: p })
    }).then(function(r) { return r.json(); }).then(function(d) {
        alert("Зарегистрировались!");
        hideReg();
    });
}

function doLogin() {
    var l = document.getElementById('login').value;
    var p = document.getElementById('password').value;
    fetch(API + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: l, password: p })
    }).then(function(res) {
        if (res.status == 400) {
            alert("Ошибка логина!");
            return;
        }
        return res.json();
    }).then(function(data) {
        if (data) {
            myToken = data.token;
            myLogin = l;
            amIAdmin = data.isAdmin;
            myPermission = data.hasPermission;
            data.login = l;
            localStorage.setItem('myUser', JSON.stringify(data));
            openMain();
        }
    });
}

function updatePanels() {
    var adminPanel = document.getElementById('admin-panel');
    var userPanel = document.getElementById('user-panel');
    var roleText = document.getElementById('role-text');

    if (amIAdmin == true) {
        roleText.innerText = '(Админ)';
        adminPanel.style.display = 'block';
        userPanel.style.display = 'none';
    } else if (myPermission == true) {
        roleText.innerText = '(Жилец с правами)';
        adminPanel.style.display = 'block';
        userPanel.style.display = 'none';
    } else {
        roleText.innerText = '(Жилец)';
        adminPanel.style.display = 'none';
        userPanel.style.display = 'block';
    }
}

function openMain() {
    document.getElementById('auth-block').style.display = 'none';
    document.getElementById('main-screen').style.display = 'block';
    updatePanels();

    loadDevices();
    loadScenarios();
    loadNotifs();
    loadRequests();

    setInterval(function() {
        console.log("Проверяем активность...");
        loadDevices();
        loadRequests();
        
        // Обновляем свои права (вдруг админ одобрил)
        fetch(API + '/me?login=' + myLogin)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.hasPermission != myPermission) {
                    console.log("Права изменились!");
                    myPermission = data.hasPermission;
                    amIAdmin = data.isAdmin;
                    updatePanels();
                    loadScenarios();
                }
            });
    }, 2000);
}

function logout() {
    localStorage.removeItem('myUser');
    location.reload();
}

function loadDevices() {
    fetch(API + '/devices').then(function(r) { return r.json(); }).then(function(devs) {
        var ul = document.getElementById('device-list');
        ul.innerHTML = '';
        for (var i = 0; i < devs.length; i++) {
            var li = document.createElement('li');
            li.innerText = devs[i].name + ' - ' + devs[i].status;
            ul.appendChild(li);
        }
    });
}

function addDevice() {
    var n = document.getElementById('dev-name').value;
    var t = document.getElementById('dev-type').value;
    fetch(API + '/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, type: t })
    }).then(function() {
        alert("Устройство добавлено!");
        loadDevices();
    });
}

function loadRequests() {
    fetch(API + '/requests').then(function(r) { return r.json(); }).then(function(data) {
        var ul = document.getElementById('requests-list');
        ul.innerHTML = '';
        for (var i = 0; i < data.length; i++) {
            var li = document.createElement('li');
            if (data[i].status == 'pending') {
                li.innerHTML = data[i].login + ' — <b>ждёт</b> ' +
                    '<button onclick="approveRequest(' + data[i].id + ')">Одобрить</button> ' +
                    '<button onclick="rejectRequest(' + data[i].id + ')">Отклонить</button>';
            } else if (data[i].status == 'approved') {
                li.innerText = data[i].login + ' — одобрено';
            } else {
                li.innerText = data[i].login + ' — отклонено';
            }
            ul.appendChild(li);
        }
    });
}

function approveRequest(id) {
    fetch(API + '/requests/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    }).then(function() {
        alert("Одобрено!");
        loadRequests();
    });
}

function rejectRequest(id) {
    fetch(API + '/requests/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    }).then(function() {
        loadRequests();
    });
}

function requestPermission() {
    fetch(API + '/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: myLogin })
    }).then(function(r) { return r.json(); }).then(function(d) {
        if (d.success == false) {
            alert(d.message);
        } else {
            alert("Заявка отправлена в УК!");
        }
    });
}

function loadScenarios() {
    fetch(API + '/scenarios?login=' + myLogin).then(function(r) { return r.json(); }).then(function(data) {
        var ul = document.getElementById('scenario-list');
        ul.innerHTML = '';
        for (var i = 0; i < data.length; i++) {
            var li = document.createElement('li');
            if (data[i].isShared == true) {
                li.innerText = data[i].name + ' [общий]';
            } else {
                li.innerText = data[i].name + ' [мой]';
            }
            ul.appendChild(li);
        }
    });
}

function addScenario() {
    var name = document.getElementById('scen-name').value;
    var isShared = document.getElementById('scen-shared').checked;
    fetch(API + '/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, owner: myLogin, isShared: isShared })
    }).then(function() {
        alert("Сценарий создан!");
        document.getElementById('scen-name').value = '';
        document.getElementById('scen-shared').checked = false;
        loadScenarios();
    });
}

function loadNotifs() {
    fetch(API + '/notifications').then(function(r) { return r.json(); }).then(function(data) {
        var ul = document.getElementById('notif-list');
        ul.innerHTML = '';
        for (var i = 0; i < data.length; i++) {
            var li = document.createElement('li');
            li.innerText = data[i].text;
            ul.appendChild(li);
        }
    });
}