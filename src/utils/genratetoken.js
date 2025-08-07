const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const generateToken = (payload, expiresIn) => {
        const tokenPayload = {
                ...payload,
                sessionId: uuidv4(), // ensures each token is unique
        };
        return jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn });
};

const verifyToken = (token) => {
        return jwt.verify(token, process.env.JWT_SECRET);
};
module.exports = { generateToken, verifyToken };