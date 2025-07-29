const { db } = require("../utils/db"); // ✅ Assuming db object is exported from db.js
const userService = require("../services/user.services");
const jwt = require("jsonwebtoken"); // Keep this for token generation/verification
const catchAsync = require('../utils/catchAsync');

// REGISTER
exports.register = catchAsync(async (req, res) => {
    const result = await userService.registerUser(req.body);
    res.status(201).json(result);
});

// LOGIN
exports.login = catchAsync(async (req, res) => {
    const { user, token } = await userService.loginUser(req);
    res.status(200).json({ token, user });
});

// GET PROFILE
exports.getProfile = catchAsync(async (req, res) => {
    const userId = req.user.id; // User ID from decoded token, remains the same UUID
    // Mongoose: usermodel.findById(userId).select('_id str_email str_fullName str_role');
    // Sequelize: Find by primary key and select specific attributes
    const user = await db.User.findByPk(userId, {
        attributes: ['id', 'str_email', 'str_fullName', 'str_role']
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
        id: user.id, // ✅ Changed from user._id to user.id
        email: user.str_email,
        fullName: user.str_fullName,
        role: user.str_role
    });
});

// UPDATE PROFILE
exports.updateProfile = catchAsync(async (req, res) => {
    const updatedUser = await userService.updateUser(req.user.id, req);
    res.status(200).json(updatedUser);
});

// SEND PASSWORD RESET LINK
exports.sendPasswordResetLink = catchAsync(async (req, res) => {
    const result = await userService.sendPasswordResetLink(req.body.email);
    res.status(200).json(result);
});

// SET NEW PASSWORD
exports.setNewPassword = catchAsync(async (req, res) => {
    const { token, newPassword } = req.body;
    const result = await userService.setNewPassword(token, newPassword);
    res.status(200).json(result);
});

// LOGOUT
exports.logout = (req, res) => {
    res.status(200).json({ message: 'Token-based logout: just delete token from client.' });
};

// update password
exports.updatePassword = catchAsync(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const result = await userService.updatePassword(req.user.id, currentPassword, newPassword);
    res.status(result.statusCode).json({ message: result.message });
});

// admin dashboard
exports.getAdminDashboard = catchAsync(async (req, res) => {
    const result = await userService.getAdminDashboard();
    res.status(result.statusCode).json(result.data);
});

//refreshToken
exports.refreshToken = catchAsync(async (req, res) => {
    const result = await userService.refreshToken(req.user.id);
    res.status(result.statusCode).json({ token: result.token });
});

// DELETE USER
exports.deleteUser = catchAsync(async (req, res) => {
    const userId = req.params.id; // Assuming user ID is passed as a URL parameter
    const result = await userService.deleteUser(userId);
    res.status(result.statusCode).json(result);
});