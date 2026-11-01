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

loginButton.onclick = function(event) {
    event.preventDefault();

    var login = document.getElementById('login').value;
    var password = document.getElementById('password').value;

    if (login == '' || password == '') {
        alert('Введите логин и пароль');
        return;
    }

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
                    token: data.access_token,
                    login: login,
                    isAdmin: fastUser.is_superuser == true || expressUser.isAdmin == true,
                    hasPermission: expressUser.hasPermission
                };

                localStorage.setItem('myUser', JSON.stringify(user));

                if (user.isAdmin == true) {
                    location.href = 'domik_admin.html';
                } else {
                    location.href = 'domik.html';
                }
            });
        });
    });
};
