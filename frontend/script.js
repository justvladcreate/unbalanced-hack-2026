var API = 'http://localhost:3000/api';
var myToken = '';
var amIAdmin = false;
var myPermission = false;

window.onload = function() {
    var saved = localStorage.getItem('myUser');
    if (saved) {
        var obj = JSON.parse(saved);
        myToken = obj.token;
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
        alert("Успешно зарегистрировались!");
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
            amIAdmin = data.isAdmin;
            myPermission = data.hasPermission;
            
            localStorage.setItem('myUser', JSON.stringify(data));
            console.log("Вошли! Админ? " + amIAdmin);
            openMain();
        }
    });
}

function openMain() {
    document.getElementById('auth-block').style.display = 'none';
    document.getElementById('main-screen').style.display = 'block';
    
    if (amIAdmin == true) {
        document.getElementById('role-text').innerText = '(Админ)';
        document.getElementById('admin-panel').style.display = 'block';
        document.getElementById('user-panel').style.display = 'none';
    } else {
        document.getElementById('role-text').innerText = '(Жилец)';
        document.getElementById('admin-panel').style.display = 'none';
        
        if (myPermission == true) {
            document.getElementById('admin-panel').style.display = 'block';
            document.getElementById('user-panel').style.display = 'none';
        } else {
            document.getElementById('user-panel').style.display = 'block';
        }
    }
    
    loadDevices();
    loadScenarios();
    loadNotifs();
    
    // Опрос раз в 2 секунды, как на диаграмме
    setInterval(function() {
        console.log("Проверяем активность...");
        loadDevices();
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
            // Плохая практика: += в цикле и document.createElement
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

function loadScenarios() {
    fetch(API + '/scenarios').then(function(r) { return r.json(); }).then(function(data) {
        var ul = document.getElementById('scenario-list');
        ul.innerHTML = '';
        for (var i = 0; i < data.length; i++) {
            var li = document.createElement('li');
            li.innerText = data[i].name;
            ul.appendChild(li);
        }
    });
}

function addScenario() {
    var name = document.getElementById('scen-name').value;
    fetch(API + '/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    }).then(function() {
        alert("Сценарий создан!");
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

function sendRequest() {
    var txt = document.getElementById('req-text').value;
    fetch(API + '/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt })
    }).then(function() {
        alert("Запрос в УК отправлен!");
    });
}

function givePermission() {
    fetch(API + '/give-permission', { method: 'POST' }).then(function() {
        alert("Права жильцу выданы!");
    });
}