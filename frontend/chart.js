var chartDevice = null;
var chartCanvas = null;
var chartUser = JSON.parse(localStorage.getItem('myUser') || '{}');

function setupChart() {
    var box = document.querySelector('.cont2');

    if (!box) {
        return;
    }

    box.innerHTML = '<div id="chart-title" style="font-size: 24px; text-align: center; padding-top: 15px;">Выберите датчик</div><canvas id="chart" width="960" height="300" style="display: block; margin: 10px auto;"></canvas>';
    chartCanvas = document.getElementById('chart');
}

function getChartSignal(device) {
    if (!device || !device.declaration || !device.state) {
        return null;
    }

    for (var i = 0; i < device.declaration.length; i++) {
        var signal = device.declaration[i];

        if (signal.control == 'graph' && typeof device.state[signal.name] == 'number') {
            return signal;
        }
    }

    for (var name in device.state) {
        if (typeof device.state[name] == 'number') {
            return { name: name, title: name, measure: '' };
        }
    }

    return null;
}

function drawChart() {
    var title = document.getElementById('chart-title');
    var ctx = chartCanvas.getContext('2d');

    ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

    if (!chartDevice) {
        title.innerText = 'Выберите датчик';
        return;
    }

    var signal = getChartSignal(chartDevice);

    if (!signal) {
        title.innerText = chartDevice.name;
        ctx.fillStyle = 'gray';
        ctx.font = '20px serif';
        ctx.fillText('Нет данных для графика', 340, chartCanvas.height / 2);
        return;
    }

    var history = [];

    if (chartDevice.history && chartDevice.history[signal.name]) {
        history = chartDevice.history[signal.name];
    }

    if (history.length == 0) {
        history.push({ t: Date.now(), v: chartDevice.state[signal.name] });
    }

    var min = history[0].v;
    var max = history[0].v;

    for (var i = 1; i < history.length; i++) {
        if (history[i].v < min) {
            min = history[i].v;
        }
        if (history[i].v > max) {
            max = history[i].v;
        }
    }

    if (min == max) {
        min = min - 1;
        max = max + 1;
    }

    title.innerText = chartDevice.name + ' — ' + signal.title;

    if (signal.measure) {
        title.innerText = title.innerText + ' (' + signal.measure + ')';
    }

    ctx.strokeStyle = 'lightgray';
    ctx.fillStyle = 'gray';
    ctx.font = '14px serif';

    var left = 50;
    var right = chartCanvas.width - 50;
    var top = 30;
    var bottom = chartCanvas.height - 30;

    for (var line = 0; line < 5; line++) {
        var y = top + line * (bottom - top) / 4;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();

        var value = max - (max - min) * line / 4;
        ctx.fillText(Math.round(value * 10) / 10, 5, y + 5);
    }

    ctx.beginPath();
    ctx.strokeStyle = 'gray';
    ctx.lineWidth = 3;

    for (var j = 0; j < history.length; j++) {
        var x = left;
        var pointY = bottom;

        if (history.length > 1) {
            x = left + (right - left) * j / (history.length - 1);
        }

        pointY = bottom - (bottom - top) * (history[j].v - min) / (max - min);

        if (j == 0) {
            ctx.moveTo(x, pointY);
        } else {
            ctx.lineTo(x, pointY);
        }
    }

    ctx.stroke();
}

function showChart(device) {
    chartDevice = device;
    drawChart();

    if (typeof showControls == 'function') {
        showControls(device);
    }
}

function refreshChart() {
    fetch('/api/devices?token=' + encodeURIComponent(chartUser.token || '')).then(function(response) {
        return response.json();
    }).then(function(list) {
        if (!chartDevice) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].state) {
                    chartDevice = list[i];
                    break;
                }
            }
        } else {
            for (var j = 0; j < list.length; j++) {
                if (list[j].id == chartDevice.id) {
                    chartDevice = list[j];
                }
            }
        }

        if (chartCanvas) {
            drawChart();
        }

        if (typeof showControls == 'function') {
            showControls(chartDevice);
        }
    });
}

setupChart();
refreshChart();
setInterval(refreshChart, 3000);
