function isValidLogin(login, password) {
    return login.length > 0 && password.length > 0;
}

function getDeviceStatusText(device) {
    if (!device || !device.status) return 'Неизвестно';
    return `${device.name} (${device.type}) - ${device.status}`;
}

function getRoleBlock(isAdmin) {
    return isAdmin ? 'admin-block' : 'user-block';
}

describe("Валидация формы входа", function() {
    it("должен возвращать true, если логин и пароль введены", function() {
        assert.isTrue(isValidLogin("admin", "123"));
    });

    it("должен возвращать false, если логин пустой", function() {
        assert.isFalse(isValidLogin("", "123"));
    });

    it("должен возвращать false, если пароль пустой", function() {
        assert.isFalse(isValidLogin("admin", ""));
    });
});

describe("Форматирование устройств", function() {
    it("должен правильно склеивать строку для устройства", function() {
        const device = { name: 'Шлагбаум', type: 'barrier', status: 'CLOSED' };
        assert.equal(getDeviceStatusText(device), 'Шлагбаум (barrier) - CLOSED');
    });

    it("должен возвращать заглушку, если устройство не передано", function() {
        assert.equal(getDeviceStatusText(null), 'Неизвестно');
    });
});

describe("Определение роли интерфейса", function() {
    it("должен возвращать admin-block для админа", function() {
        assert.equal(getRoleBlock(true), 'admin-block');
    });

    it("должен возвращать user-block для жильца", function() {
        assert.equal(getRoleBlock(false), 'user-block');
    });
});