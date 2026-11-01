var express = require('express');
var cors = require('cors');
var path = require('path');

var app = express();
var port = 3000;
var frontend = path.join(__dirname, '../frontend');

app.use(cors());
app.use(express.json());

app.get('/', function(req, res) {
    res.sendFile(path.join(frontend, 'register.html'));
});

app.use(express.static(frontend));

var devices = [
    { id: 1, name: 'Датчик протечки', type: 'leak', status: 'OK' },
    { id: 2, name: 'Шлагбаум', type: 'barrier', status: 'CLOSED' }
];

var scenarios = [
    { id: 1, name: 'Если протечка — выключить воду', owner: 'admin', isShared: true }
];

var notifications = [
    { id: 1, text: 'Плановое отключение воды завтра' }
];

var requests = [];
var fastHistory = {};

var users = [
    { login: 'admin', pass: 'admin', isAdmin: true, hasPermission: false },
    { login: 'user', pass: 'user', isAdmin: false, hasPermission: false }
];

app.post('/api/login', function(req, res) {
    var login = req.body.login;
    var pass = req.body.password;
    var found = false;
    for (var i = 0; i < users.length; i++) {
        if (users[i].login == login && users[i].pass == pass) {
            found = true;
            res.json({ success: true, token: 'token-123', isAdmin: users[i].isAdmin, hasPermission: users[i].hasPermission });
        }
    }
    if (found == false) {
        res.status(400).json({ error: 'Неверный логин или пароль!' });
    }
});

app.post('/api/register', function(req, res) {
    console.log("Регистрация юзера: " + req.body.login);
    users.push({ login: req.body.login, pass: req.body.password, isAdmin: false, hasPermission: false });
    res.json({ success: true });
});

app.get('/api/me', function(req, res) {
    var login = req.query.login;
    for (var i = 0; i < users.length; i++) {
        if (users[i].login == login) {
            return res.json({ login: users[i].login, isAdmin: users[i].isAdmin, hasPermission: users[i].hasPermission });
        }
    }
    res.json({ login: login, isAdmin: false, hasPermission: false });
});

app.get('/api/users', function(req, res) {
    var result = [];
    for (var i = 0; i < users.length; i++) {
        result.push({ login: users[i].login, isAdmin: users[i].isAdmin, hasPermission: users[i].hasPermission });
    }
    res.json(result);
});

app.get('/api/devices', function(req, res) {
    var token = req.query.token;

    if (!token) {
        return res.json(devices);
    }

    var headers = { 'Authorization': 'Bearer ' + token };

    fetch('http://localhost:8000/api/v1/users/me', { headers: headers }).then(function(response) {
        return response.json();
    }).then(function(user) {
        var url = 'http://localhost:8000/api/v1/smart_house';

        if (user.is_superuser == true) {
            url = url + '/admin/all';
        }

        return fetch(url, { headers: headers }).then(function(response) {
            return response.json();
        });
    }).then(function(projects) {
        var result = [];

        for (var i = 0; i < devices.length; i++) {
            if (!devices[i].ext_id) {
                result.push(devices[i]);
            }
        }

        for (var p = 0; p < projects.length; p++) {
            if (!projects[p].devices) {
                continue;
            }

            for (var d = 0; d < projects[p].devices.length; d++) {
                var fastDevice = projects[p].devices[d];

                if (!fastDevice.declaration || !fastDevice.state) {
                    continue;
                }

                var key = 'p' + projects[p].id + '_' + fastDevice.id;
                var history = {};

                if (fastHistory[key]) {
                    history = fastHistory[key];
                }

                for (var s = 0; s < fastDevice.declaration.length; s++) {
                    var signal = fastDevice.declaration[s];
                    var value = fastDevice.state[signal.name];

                    if (signal.control != 'graph' || typeof value != 'number') {
                        continue;
                    }

                    if (!history[signal.name]) {
                        history[signal.name] = [];
                    }

                    history[signal.name].push({ t: Date.now(), v: value });

                    if (history[signal.name].length > 30) {
                        history[signal.name].shift();
                    }
                }

                fastHistory[key] = history;

                result.push({
                    id: key,
                    project_id: projects[p].id,
                    name: fastDevice.title,
                    type: fastDevice.family,
                    ext_id: fastDevice.id,
                    family: fastDevice.family,
                    state: fastDevice.state,
                    declaration: fastDevice.declaration,
                    history: history,
                    status: 'OK'
                });
            }
        }

        res.json(result);
    }).catch(function() {
        res.json(devices);
    });
});

app.post('/api/devices', function(req, res) {
    var token = req.body.token;

    if (!token) {
        return res.status(401).json({ error: 'Нужен токен FastAPI' });
    }

    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

    fetch('http://localhost:8000/api/v1/smart_house', { headers: headers }).then(function(response) {
        return response.json();
    }).then(function(projects) {
        if (projects.length > 0) {
            return projects[0].id;
        }

        return fetch('http://localhost:8000/api/v1/smart_house', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ name: 'Мой дом' })
        }).then(function(response) {
            return response.json();
        }).then(function(project) {
            return project.id;
        });
    }).then(function(projectId) {
        return fetch('http://localhost:8000/api/v1/smart_house/' + projectId + '/devices', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ title: req.body.name, family: req.body.type })
        }).then(function(response) {
            return response.json();
        });
    }).then(function(project) {
        if (!project.devices) {
            return res.status(400).json({ error: 'FastAPI не добавил устройство' });
        }

        var fastDevice = project.devices[project.devices.length - 1];
        var newDev = {
            id: Date.now(),
            project_id: project.id,
            name: req.body.name,
            type: req.body.type,
            unit: req.body.unit || '',
            ext_id: fastDevice.id,
            family: fastDevice.family,
            state: fastDevice.state,
            declaration: fastDevice.declaration,
            history: {},
            status: 'NEW'
        };

        devices.push(newDev);
        console.log("Добавили устройство!");
        res.json(newDev);
    }).catch(function() {
        res.status(500).json({ error: 'Не удалось добавить устройство' });
    });
});

app.get('/api/scenarios', function(req, res) {
    var login = req.query.login;
    var result = [];
    for (var i = 0; i < scenarios.length; i++) {
        if (scenarios[i].isShared == true || scenarios[i].owner == login) {
            result.push(scenarios[i]);
        }
    }
    res.json(result);
});

app.post('/api/scenarios', function(req, res) {
    scenarios.push({
        id: Date.now(),
        name: req.body.name,
        owner: req.body.owner,
        isShared: req.body.isShared == true
    });
    console.log("Создали сценарий!");
    res.json({ success: true });
});

app.get('/api/notifications', function(req, res) {
    res.json(notifications);
});

app.post('/api/requests', function(req, res) {
    var login = req.body.login;
    for (var i = 0; i < requests.length; i++) {
        if (requests[i].login == login && requests[i].status == 'pending') {
            return res.json({ success: false, message: 'Заявка уже отправлена' });
        }
    }
    requests.push({ id: Date.now(), login: login, status: 'pending' });
    console.log("Новая заявка от: " + login);
    res.json({ success: true });
});

app.get('/api/requests', function(req, res) {
    res.json(requests);
});

app.post('/api/requests/approve', function(req, res) {
    var id = req.body.id;
    for (var i = 0; i < requests.length; i++) {
        if (requests[i].id == id) {
            requests[i].status = 'approved';
            for (var j = 0; j < users.length; j++) {
                if (users[j].login == requests[i].login) {
                    users[j].hasPermission = true;
                }
            }
        }
    }
    console.log("Заявка одобрена!");
    res.json({ success: true });
});

app.post('/api/requests/reject', function(req, res) {
    var id = req.body.id;
    for (var i = 0; i < requests.length; i++) {
        if (requests[i].id == id) {
            requests[i].status = 'rejected';
        }
    }
    res.json({ success: true });
});

setInterval(function() {
    var randomIndex = Math.floor(Math.random() * devices.length);
    devices[randomIndex].status = Math.random() > 0.5 ? 'OK' : 'ERROR';

    for (var i = 0; i < devices.length; i++) {
        if (!devices[i].state || !devices[i].declaration) {
            continue;
        }

        if (!devices[i].history) {
            devices[i].history = {};
        }

        for (var j = 0; j < devices[i].declaration.length; j++) {
            var signal = devices[i].declaration[j];

            if (signal.control != 'graph' || typeof devices[i].state[signal.name] != 'number') {
                continue;
            }

            var nextValue = devices[i].state[signal.name] + (Math.random() - 0.5) * 2;
            devices[i].state[signal.name] = Math.round(nextValue * 10) / 10;

            if (!devices[i].history[signal.name]) {
                devices[i].history[signal.name] = [];
            }

            devices[i].history[signal.name].push({ t: Date.now(), v: devices[i].state[signal.name] });

            if (devices[i].history[signal.name].length > 30) {
                devices[i].history[signal.name].shift();
            }
        }
    }

    console.log("[UJIN SYNC] Сходили в Ujin, обновили устройства в БД");
}, 5000);

app.get('/tests', function(req, res) {
  res.sendFile(path.join(frontend, 'tests.html'));
});

app.listen(port, function() {
  console.log('Сервер запущен на http://localhost:' + port);
});