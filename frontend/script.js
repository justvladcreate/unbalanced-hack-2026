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

window.onload = async () => {
    await fetchData();
    
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginForm = document.getElementById('login-form');
    const dashboard = document.getElementById('dashboard');
    const adminBlock = document.getElementById('admin-block');
    const userBlock = document.getElementById('user-block');
    const roleLabel = document.getElementById('role-label');

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
                    loginForm.style.display = 'none';
                    dashboard.style.display = 'block';
                    
                    if (data.isAdmin) {
                        roleLabel.textContent = '(Админ)';
                        adminBlock.style.display = 'block';
                        userBlock.style.display = 'none';
                    } else {
                        roleLabel.textContent = '(Жилец)';
                        adminBlock.style.display = 'none';
                        userBlock.style.display = 'block';
                    }
                    
                    loadDevices();
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
            loginForm.style.display = 'block';
            dashboard.style.display = 'none';
            document.getElementById('login').value = '';
            document.getElementById('password').value = '';
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