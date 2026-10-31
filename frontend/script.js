window.onload = async () => {
    await fetchData();
}

let html = document.querySelector('html');


const API_URL = 'http://localhost:3000';


async function fetchData() {
    try {
        const response = await fetch(`${API_URL}/tests`);

        html.innerHTML = response;

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}