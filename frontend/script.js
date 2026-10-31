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
}