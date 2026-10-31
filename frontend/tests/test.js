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