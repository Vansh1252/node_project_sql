const { deleteUser, getAdminDashboard, totalrevenueservice,getProfile, loginUser, logoutAllDevicesService, logoutSingleDeviceService, refreshToken, registerUser, sendPasswordResetLink, setNewPassword, updatePassword, updateUser } = require('../services/user.services');
const catchAsync = require('../utils/catchAsync');

// REGISTER
exports.register = catchAsync(async (req, res, next) => {
    const result = await registerUser(req.body);
    res.status(result.statusCode).json({ message: result.message, userId: result.userId });
});

// LOGIN
exports.login = catchAsync(async (req, res, next) => {
    const result = await loginUser(req);
    res
        .cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        })
        .status(result.statusCode)
        .json({ message: result.message, accessToken: result.accessToken, user: result.user });
});

// GET PROFILE
exports.getProfile = catchAsync(async (req, res, next) => {
    const result = await getProfile(req.user.id);
    res.status(result.statusCode).json(result.user);
});

// UPDATE PROFILE
exports.updateProfile = catchAsync(async (req, res, next) => {
    const result = await updateUser(req.user.id, req.body);
    res.status(result.statusCode).json({ message: result.message, data: result.data });
});

// SEND PASSWORD RESET LINK
exports.sendPasswordResetLink = catchAsync(async (req, res, next) => {
    const result = await sendPasswordResetLink(req.body.email);
    res.status(result.statusCode).json({ message: result.message });
});

// SET NEW PASSWORD
exports.setNewPassword = catchAsync(async (req, res, next) => {
    const { token, newPassword } = req.body;
    const result = await setNewPassword(token, newPassword);
    res.status(result.statusCode).json({ message: result.message });
});

// LOGOUT (SINGLE DEVICE)
exports.logout = catchAsync(async (req, res, next) => {
    const refreshToken = req.cookies?.refreshToken;
    const result = await logoutSingleDeviceService(refreshToken);
    res
        .clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
        })
        .status(result.statusCode)
        .json({ message: result.message });
});

// LOGOUT (ALL DEVICES)
exports.logoutAllDevices = catchAsync(async (req, res, next) => {
    const refreshToken = req.cookies?.refreshToken;
    const result = await logoutAllDevicesService(refreshToken);
    res
        .clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
        })
        .status(result.statusCode)
        .json({ message: result.message });
});

// UPDATE PASSWORD
exports.updatePassword = catchAsync(async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;
    const result = await updatePassword(req.user.id, currentPassword, newPassword);
    res.status(result.statusCode).json({ message: result.message });
});

// ADMIN DASHBOARD
exports.getAdminDashboard = catchAsync(async (req, res, next) => {
    const result = await getAdminDashboard();
    res.status(result.statusCode).json(result.data);
});

// REFRESH TOKEN
exports.refreshToken = catchAsync(async (req, res, next) => {
    const result = await refreshToken(req);
    res
        .cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        })
        .status(result.statusCode)
        .json({ message: result.message, accessToken: result.accessToken, user: result.user });
});

// DELETE USER
exports.deleteUser = catchAsync(async (req, res, next) => {
    const result = await deleteUser(req.user.id);
    res.status(result.statusCode).json({ message: result.message });
});

exports.totalrevenue = catchAsync(async (req, res, next) => {
    const result = await totalrevenueservice(req);
    res.status(result.statusCode).json(result.data);
});