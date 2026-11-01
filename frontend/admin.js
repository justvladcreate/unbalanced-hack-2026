var saved = localStorage.getItem('myUser');

if (!saved) {
    location.href = 'register.html';
}

var user = JSON.parse(saved);

if (user.isAdmin != true) {
    location.href = 'domik.html';
}

var logoutButton = document.querySelector('.knopka4');

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

function loadDevices() {
    fetch('/api/devices').then(function(response) {
        return response.json();
    }).then(function(devices) {
        var box = document.querySelector('.cont4helper');
        box.innerHTML = '';

        for (var i = 0; i < devices.length; i++) {
            var cssClass = getDeviceClass(devices[i].type);
            box.innerHTML += '<div class="' + cssClass + '">' + devices[i].name + ' — ' + devices[i].status + '</div>';
        }
    });
}

function approveRequest(id) {
    fetch('/api/requests/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    }).then(function() {
        loadPanel();
    });
}

function rejectRequest(id) {
    fetch('/api/requests/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    }).then(function() {
        loadPanel();
    });
}

function loadNotifications() {
    fetch('/api/notifications').then(function(response) {
        return response.json();
    }).then(function(notifications) {
        fetch('/api/requests').then(function(response) {
            return response.json();
        }).then(function(requests) {
            var box = document.querySelector('.cont3helper');
            box.innerHTML = '';

            for (var i = 0; i < notifications.length; i++) {
                box.innerHTML += '<div class="barrier1">' + notifications[i].text + '</div>';
            }

            for (var j = 0; j < requests.length; j++) {
                if (requests[j].status == 'pending') {
                    box.innerHTML += '<div class="barrier1">' + requests[j].login + ' — ждёт <button onclick="approveRequest(' + requests[j].id + ')">Одобрить</button> <button onclick="rejectRequest(' + requests[j].id + ')">Отклонить</button></div>';
                } else {
                    box.innerHTML += '<div class="barrier1">' + requests[j].login + ' — ' + requests[j].status + '</div>';
                }
            }
        });
    });
}

function loadUsers() {
    fetch('/api/users').then(function(response) {
        return response.json();
    }).then(function(users) {
        var box = document.querySelector('.polzovateli');
        box.innerHTML = '';

        for (var i = 0; i < users.length; i++) {
            var role = '';

            if (users[i].isAdmin == true) {
                role = ' (админ)';
            } else if (users[i].hasPermission == true) {
                role = ' (с правами)';
            }

            box.innerHTML += '<div>' + (i + 1) + ') ' + users[i].login + role + '</div>';
        }
    });
}

function loadPanel() {
    loadDevices();
    loadNotifications();
    loadUsers();
}

loadPanel();
setInterval(loadPanel, 2000);
