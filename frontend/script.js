const API_URL = 'http://localhost:3000';

async function fetchData() {
    try {
        const response = await fetch(`${API_URL}/tests`);
        const text = await response.text();
        console.log("Данные с сервера получены:", text.substring(0, 50) + "...");
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function loadDevices() {
    try {
        const response = await fetch(`${API_URL}/api/devices`);
        const devices = await response.json();
        
        const list = document.getElementById('devices-list');
        list.innerHTML = '';
        
        devices.forEach(device => {
            const li = document.createElement('li');
            li.textContent = `${device.name} (${device.type}) - ${device.status}`;
            list.appendChild(li);
        });
    } catch (error) {
        console.error('Error loading devices:', error);
    }
}

function showDashboard(isAdmin) {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    
    const roleLabel = document.getElementById('role-label');
    const adminBlock = document.getElementById('admin-block');
    const userBlock = document.getElementById('user-block');

    if (isAdmin) {
        roleLabel.textContent = '(Админ)';
        adminBlock.style.display = 'block';
        userBlock.style.display = 'none';
    } else {
        roleLabel.textContent = '(Жилец)';
        adminBlock.style.display = 'none';
        userBlock.style.display = 'block';
    }

    loadDevices();
    setInterval(loadDevices, 2000);
}

window.onload = async () => {
    await fetchData();
    
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    const savedToken = localStorage.getItem('token');
    const savedIsAdmin = localStorage.getItem('isAdmin') === 'true';

    if (savedToken) {
        showDashboard(savedIsAdmin);
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const loginVal = document.getElementById('login').value;
            const passVal = document.getElementById('password').value;

            try {
                const response = await fetch(`${API_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ login: loginVal, password: passVal })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('isAdmin', data.isAdmin);
                    showDashboard(data.isAdmin);
                } else {
                    alert("Ошибка: " + data.error);
                }
            } catch (err) {
                console.error("Ошибка при отправке:", err);
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.clear();
            location.reload();
        });
    }

    const addDeviceBtn = document.getElementById('add-device-btn');
    if (addDeviceBtn) {
        addDeviceBtn.addEventListener('click', async () => {
            const name = document.getElementById('new-dev-name').value;
            const type = document.getElementById('new-dev-type').value;

            if (!name || !type) {
                return alert('Заполните все поля');
            }

            try {
                await fetch(`${API_URL}/api/devices`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, type })
                });
                
                document.getElementById('new-dev-name').value = '';
                document.getElementById('new-dev-type').value = '';
                loadDevices();
            } catch (err) {
                console.error(err);
            }
        });
    }

    const sendRequestBtn = document.getElementById('send-request-btn');
    if (sendRequestBtn) {
        sendRequestBtn.addEventListener('click', async () => {
            const text = document.getElementById('request-text').value;

            if (!text) {
                return alert('Введите текст запроса');
            }

            try {
                await fetch(`${API_URL}/api/requests`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
                });
                
                document.getElementById('request-text').value = '';
                alert('Запрос отправлен в УК');
            } catch (err) {
                console.error(err);
            }
        });
    }
}