const jwt = require('jsonwebtoken');

exports.protect = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Unauthorized, JWT token is required" });
    }

    // Extract token after 'Bearer'
    const token = authHeader.split(' ')[1];

    try {
        // Verify token and attach user info to request
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ message: 'Token is invalid or expired' });
    }
};

exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            console.log(roles)
            return res.status(403).json({ message: 'Access denied' });
        }
        next();
    };
};
