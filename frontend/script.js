const API_URL = 'http://localhost:3000';

async function fetchData() {
    try {
        const response = await fetch(`${API_URL}/tests`);
        const text = await response.text(); // Читаем как текст
        console.log("Данные с сервера получены:", text.substring(0, 50) + "...");
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

window.onload = async () => {
    await fetchData();
    
    const loginBtn = document.getElementById('login-btn');
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
                console.log("Ответ от сервера:", data);
                
                if (data.success) {
                    alert("Успешный вход! isAdmin: " + data.isAdmin);
                } else {
                    alert("Ошибка: " + data.error);
                }
            } catch (err) {
                console.error("Ошибка при отправке:", err);
            }
        });
    }
}