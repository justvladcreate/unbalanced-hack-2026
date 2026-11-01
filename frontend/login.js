var FASTAPI = 'http://localhost:8000';

var saved = localStorage.getItem('myUser');

if (saved) {
    var user = JSON.parse(saved);
    if (user.isAdmin == true) {
        location.href = 'domik_admin.html';
    } else {
        location.href = 'domik.html';
    }
}

var loginButton = document.querySelector('.v22');

function enterSite(accessToken, login, password, fastUser) {
    return fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login, password: password })
    }).then(function() {
        return fetch('/api/me?login=' + encodeURIComponent(login));
    }).then(function(response) {
        return response.json();
    }).then(function(expressUser) {
        var user = {
            token: accessToken,
            login: login,
            isAdmin: fastUser.is_superuser == true || expressUser.isAdmin == true,
            hasPermission: expressUser.hasPermission,
            ujin_token: fastUser.ujin_token || '',
            apartment_id: fastUser.apartment_id || ''
        };

        localStorage.setItem('myUser', JSON.stringify(user));

        if (user.isAdmin == true) {
            location.href = 'domik_admin.html';
        } else {
            location.href = 'domik.html';
        }
    });
}

function loginWithUjin(login, password) {
    fetch(FASTAPI + '/api/v1/ujin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login, password: password })
    }).then(function(response) {
        return response.json();
    }).then(function(data) {
        if (!data.access_token) {
            alert(data.detail || 'Неверный телефон или пароль Ujin');
            return;
        }

        enterSite(data.access_token, data.login, password, data);
    }).catch(function() {
        alert('Ujin недоступен');
    });
}

function loginWithFastApi(login, password) {
    fetch(FASTAPI + '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'username=' + encodeURIComponent(login) + '&password=' + encodeURIComponent(password)
    }).then(function(response) {
        return response.json();
    }).then(function(data) {
        if (!data.access_token) {
            alert('Неверный логин или пароль');
            return;
        }

        return fetch(FASTAPI + '/api/v1/users/me', {
            headers: { 'Authorization': 'Bearer ' + data.access_token }
        }).then(function(response) {
            return response.json();
        }).then(function(fastUser) {
            enterSite(data.access_token, login, password, fastUser);
        });
    });
}

loginButton.onclick = function(event) {
    event.preventDefault();

    var login = document.getElementById('login').value.trim();
    var password = document.getElementById('password').value;

    if (login == '' || password == '') {
        alert('Введите логин и пароль');
        return;
    }

    if (/^\+?\d{10,15}$/.test(login)) {
        loginWithUjin(login, password);
    } else {
        loginWithFastApi(login, password);
    }
};
