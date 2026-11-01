var saved = localStorage.getItem('myUser');

if (!saved) {
    location.href = 'register.html';
}

var user = JSON.parse(saved);
var adminDevices = [];

if (user.isAdmin != true) {
    location.href = 'domik.html';
}

var adminStyle = document.createElement('style');
adminStyle.innerHTML = '.cont1 { width: 85px; min-width: 85px; max-width: 85px; overflow-x: hidden; }' +
    '.cont4helper > div { width: 380px; min-height: 58px; height: auto; padding: 6px 10px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 6px; line-height: 1.2; font-size: 18px; text-align: left; }' +
    '.cont4helper > div button { border: none; border-radius: 12px; padding: 4px 6px; background: whitesmoke; color: black; cursor: pointer; font-size: 12px; }' +
    '.cont3helper > div { width: 260px; height: auto; min-height: 50px; padding: 8px; box-sizing: border-box; line-height: 1.2; font-size: 15px; overflow-wrap: anywhere; }' +
    '.cont3helper button { border: none; border-radius: 10px; padding: 3px 6px; margin: 2px; cursor: pointer; font-size: 12px; }' +
    '.polzovateli { height: auto; max-height: 110px; overflow-y: auto; padding: 10px; font-size: 15px; line-height: 1.5; text-align: left; }' +
    '.polzovateli div { padding-left: 6px; }';
document.head.appendChild(adminStyle);

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
    fetch('/api/devices?token=' + encodeURIComponent(user.token)).then(function(response) {
        return response.json();
    }).then(function(devices) {
        adminDevices = devices;
        var box = document.querySelector('.cont4helper');
        box.innerHTML = '';

        for (var i = 0; i < devices.length; i++) {
            var cssClass = getDeviceClass(devices[i].type);
            var buttons = '';

            if (devices[i].project_id && devices[i].ext_id) {
                buttons += '<button onclick="showDeviceInfo(\'' + devices[i].project_id + '\', \'' + devices[i].ext_id + '\')">Возможности</button>';
                buttons += '<button onclick="editFastDevice(\'' + devices[i].project_id + '\', \'' + devices[i].ext_id + '\')">Изменить</button>';
                buttons += '<button onclick="deleteFastDevice(\'' + devices[i].project_id + '\', \'' + devices[i].ext_id + '\')">Удалить</button>';
            }

            box.innerHTML += '<div class="' + cssClass + '">' +
                '<span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + devices[i].name + ' — ' + devices[i].status + '</span>' +
                '<span style="display: flex; gap: 4px; flex-shrink: 0;">' + buttons + '</span>' +
                '</div>';
        }
    });
}

function findAdminDevice(projectId, deviceId) {
    for (var i = 0; i < adminDevices.length; i++) {
        if (adminDevices[i].project_id == projectId && adminDevices[i].ext_id == deviceId) {
            return adminDevices[i];
        }
    }
    return null;
}

function showDeviceInfo(projectId, deviceId) {
    var device = findAdminDevice(projectId, deviceId);

    if (!device || !device.declaration) {
        return;
    }

    var text = device.name + '\n';

    for (var i = 0; i < device.declaration.length; i++) {
        text = text + device.declaration[i].title + ' (' + device.declaration[i].name + ')\n';
    }

    alert(text);
}

function editFastDevice(projectId, deviceId) {
    var device = findAdminDevice(projectId, deviceId);

    if (!device) {
        return;
    }

    var title = prompt('Новое имя устройства', device.name);

    if (title == null || title == '') {
        return;
    }

    fetch('http://localhost:8000/api/v1/smart_house/' + projectId + '/devices/' + deviceId, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + user.token
        },
        body: JSON.stringify({ title: title })
    }).then(function() {
        loadPanel();
    });
}

function deleteFastDevice(projectId, deviceId) {
    if (!confirm('Удалить устройство?')) {
        return;
    }

    fetch('http://localhost:8000/api/v1/smart_house/' + projectId + '/devices/' + deviceId, {
        method: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + user.token
        }
    }).then(function() {
        loadPanel();
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

            if (user.token) {
                fetch('http://localhost:8000/api/v1/smart_house/admin/all', {
                    headers: { 'Authorization': 'Bearer ' + user.token }
                }).then(function(response) {
                    return response.json();
                }).then(function(projects) {
                    var fastHtml = '';

                    for (var p = 0; p < projects.length; p++) {
                        if (!projects[p].notifications) {
                            continue;
                        }

                        for (var n = 0; n < projects[p].notifications.length; n++) {
                            fastHtml += '<div class="barrier1">' + projects[p].notifications[n].message + '</div>';
                        }
                    }

                    box.insertAdjacentHTML('afterbegin', fastHtml);
                });
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
