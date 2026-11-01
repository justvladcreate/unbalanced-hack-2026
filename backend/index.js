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
    res.json(devices);
});

app.post('/api/devices', function(req, res) {
    var newDev = { id: Date.now(), name: req.body.name, type: req.body.type, status: 'NEW' };
    devices.push(newDev);
    console.log("Добавили устройство!");
    res.json(newDev);
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
    console.log("[UJIN SYNC] Сходили в Ujin, обновили устройства в БД");
}, 5000);

app.get('/tests', function(req, res) {
  res.sendFile(path.join(frontend, 'tests.html'));
});

app.listen(port, function() {
  console.log('Сервер запущен на http://localhost:' + port);
});