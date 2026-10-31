var express = require('express');
var cors = require('cors');
var path = require('path');

var app = express();
var port = 3000;
var frontend = path.join(__dirname, '../frontend');

app.use(cors());
app.use(express.json());
app.use(express.static(frontend));

var devices = [
    { id: 1, name: 'Датчик протечки', type: 'leak', status: 'OK' },
    { id: 2, name: 'Шлагбаум', type: 'barrier', status: 'CLOSED' }
];

var scenarios = [
    { id: 1, name: 'Если протечка, то выключить воду' }
];

var notifications = [
    { id: 1, text: 'Плановое отключение воды завтра' }
];

var users = [
    { login: 'admin', pass: 'admin', isAdmin: true, hasPermission: true },
    { login: 'user', pass: 'user', isAdmin: false, hasPermission: false }
];

app.post('/api/login', function(req, res) {
    var login = req.body.login;
    var pass = req.body.password;
    var found = false;
    
    for (var i = 0; i < users.length; i++) {
        if (users[i].login === login && users[i].pass === pass) {
            found = true;
            res.json({ success: true, token: 'token-123', isAdmin: users[i].isAdmin, hasPermission: users[i].hasPermission });
        }
    }
    if (!found) {
        res.status(400).json({ error: 'Неверный логин или пароль!' });
    }
});

app.post('/api/register', function(req, res) {
    console.log("Регистрация нового юзера: " + req.body.login);
    users.push({ login: req.body.login, pass: req.body.password, isAdmin: false, hasPermission: false });
    res.json({ success: true });
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
    res.json(scenarios);
});

app.post('/api/scenarios', function(req, res) {
    scenarios.push({ id: Date.now(), name: req.body.name });
    console.log("Создали сценарий!");
    res.json({ success: true });
});

app.get('/api/notifications', function(req, res) {
    res.json(notifications);
});

app.post('/api/notifications', function(req, res) {
    notifications.push({ id: Date.now(), text: req.body.text });
    res.json({ success: true });
});

app.post('/api/requests', function(req, res) {
    console.log("Жилец отправил запрос в УК: " + req.body.text);
    res.json({ success: true });
});

app.post('/api/give-permission', function(req, res) {
    users[1].hasPermission = true;
    console.log("Выдали права жильцу!");
    res.json({ success: true });
});

// Имитация фоновой синхронизации с Ujin (как на схеме в дорожке "Сервер")
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