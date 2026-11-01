var saved = localStorage.getItem('myUser');

if (!saved) {
    location.href = 'register.html';
}

var user = JSON.parse(saved);
var requestButton = document.querySelector('.knopechka');
var title = document.querySelector('.text67');
var logoutButton = document.querySelector('.knopka4');

title.innerText = 'Добро пожаловать, ' + user.login + '!';

logoutButton.onclick = function() {
    localStorage.removeItem('myUser');
    location.href = 'register.html';
};

function sendRequest() {
    fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: user.login })
    }).then(function(response) {
        return response.json();
    }).then(function(data) {
        if (data.success == false) {
            alert(data.message);
        } else {
            alert('Заявка отправлена в УК');
        }
        showButton();
    });
}

function showButton() {
    if (user.hasPermission == true) {
        requestButton.innerText = 'Доступ к устройствам открыт';
        requestButton.disabled = true;
        return;
    }

    fetch('/api/requests').then(function(response) {
        return response.json();
    }).then(function(list) {
        var pending = false;

        for (var i = 0; i < list.length; i++) {
            if (list[i].login == user.login && list[i].status == 'pending') {
                pending = true;
            }
        }

        if (pending == true) {
            requestButton.innerText = 'Заявка отправлена';
            requestButton.disabled = true;
        } else {
            requestButton.innerText = 'Отправить запрос';
            requestButton.disabled = false;
            requestButton.onclick = sendRequest;
        }
    });
}

function loadMe() {
    fetch('/api/me?login=' + encodeURIComponent(user.login)).then(function(response) {
        return response.json();
    }).then(function(data) {
        user.isAdmin = data.isAdmin;
        user.hasPermission = data.hasPermission;
        localStorage.setItem('myUser', JSON.stringify(user));
        showButton();
    });
}

showButton();
loadMe();
setInterval(loadMe, 2000);
