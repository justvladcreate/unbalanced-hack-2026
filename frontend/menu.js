var burgerMenu = null;

function showBurgerMenu() {
    if (burgerMenu) {
        burgerMenu.remove();
        burgerMenu = null;
        return;
    }

    if (typeof scenarioPanel != 'undefined' && scenarioPanel) {
        scenarioPanel.remove();
        scenarioPanel = null;
    }

    burgerMenu = document.createElement('div');
    burgerMenu.style.cssText = 'position: fixed; top: 120px; left: 120px; width: 220px; background: white; border-radius: 20px; padding: 10px; z-index: 30; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22); display: flex; flex-direction: column; gap: 8px;';

    var title = document.createElement('div');
    title.innerText = 'Меню';
    title.style.cssText = 'font-size: 20px; text-align: center;';
    burgerMenu.appendChild(title);

    var scenariosButton = document.createElement('button');
    scenariosButton.innerText = 'Сценарии';
    scenariosButton.style.cssText = 'height: 40px; border: none; border-radius: 50px; background: gray; color: white; cursor: pointer;';
    scenariosButton.onclick = function() {
        burgerMenu.remove();
        burgerMenu = null;

        if (typeof showScenarioPanel == 'function') {
            showScenarioPanel();
        }
    };
    burgerMenu.appendChild(scenariosButton);

    var logoutButton = document.createElement('button');
    logoutButton.innerText = 'Выйти';
    logoutButton.style.cssText = 'height: 40px; border: none; border-radius: 50px; background: gray; color: white; cursor: pointer;';
    logoutButton.onclick = function() {
        localStorage.removeItem('myUser');
        location.href = 'register.html';
    };
    burgerMenu.appendChild(logoutButton);

    document.body.appendChild(burgerMenu);
}

document.querySelector('.knopka4').onclick = showBurgerMenu;
