const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;
const frontend = path.join(__dirname, '../frontend');

app.use(cors());
app.use(express.json());
app.use(express.static(frontend));

const devices = [
    { id: 1, name: 'Датчик протечки', type: 'leak', status: 'OK' },
    { id: 2, name: 'Шлагбаум', type: 'barrier', status: 'CLOSED' }
];

app.post('/api/login', (req, res) => {
    const { login, password } = req.body;
    if (login && password) {
        res.json({ success: true, token: 'test-token', isAdmin: login === 'admin' });
    } else {
        res.status(400).json({ error: 'Введите логин и пароль' });
    }
});

app.get('/api/devices', (req, res) => {
    res.json(devices);
});

app.get('/tests', (req, res) => {
  res.sendFile(path.join(frontend, 'tests.html'));
});

app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
  console.log(`Tests -> http://localhost:${port}/tests`);
});