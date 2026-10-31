const express = require('express');
const path = require('path');

const app = express();
const port = 3000;
const frontend = path.join(__dirname, '../frontend');

app.use(express.static(frontend));

app.get('/tests', (req, res) => {
  res.sendFile(path.join(frontend, 'tests.html'));
});

app.listen(port, () => {
  console.log(`http://localhost:${port}`);
  console.log(`tests -> http://localhost:${port}/tests`);
});