var FASTAPI = 'http://localhost:8000';

var registerButton = document.querySelector('.v22');

registerButton.onclick = function(event) {
    event.preventDefault();

    var login = document.getElementById('login').value;
    var passwordFields = document.querySelectorAll('.password input');
    var password = passwordFields[0].value;
    var passwordAgain = passwordFields[1].value;

    if (login == '' || password == '') {
        alert('Введите логин и пароль');
        return;
    }

    if (password != passwordAgain) {
        alert('Пароли не совпадают');
        return;
    }

    fetch(FASTAPI + '/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: login,
            password: password,
            password_confirm: password
        })
    }).then(function(response) {
        return response.json().then(function(data) {
            return { status: response.status, data: data };
        });
    }).then(function(result) {
        if (result.status != 201) {
            alert('Не получилось зарегистрироваться');
            return;
        }

        fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: login, password: password })
        }).then(function() {
            alert('Зарегистрировались!');
            location.href = 'register.html';
        });
    });
};
