const secureRandomPassword = require('secure-random-password');

const randompassword = () => {
    const password = secureRandomPassword.randomPassword({
        length: 12,
        characters: [
            secureRandomPassword.lower,
            secureRandomPassword.upper,
            secureRandomPassword.digits,
            secureRandomPassword.symbols,
        ]
    });
    return password;
};

module.exports = randompassword;
