const express = require('express');
const router = express.Router();

const userController = require('../controllers/user.controllers');
const { protect, restrictTo } = require('../middleware/auth');
const { registeruser, validateUpdateUser } = require('../validations/users.validation');
const { validate } = require('../middleware/validate');
const { roles } = require('../constants/sequelizetableconstants');


// Public
router.post(
    '/register',
    registeruser,
    validate,
    userController.register
);
router.post('/login', userController.login);
// Protected
router.get('/logout-all', userController.logoutAllDevices);
router.get('/logout', userController.logout);
router.get('/me', protect, userController.getProfile);
router.put('/update', protect, validateUpdateUser, validate, userController.updateProfile);
router.post('/forgot-password', userController.sendPasswordResetLink);
router.post('/reset-password', userController.setNewPassword);
router.put('/update-password', protect, userController.updatePassword);
router.get('/dashboard/admin', protect, restrictTo(roles.ADMIN), userController.getAdminDashboard);
router.get('/refresh-token', userController.refreshToken);
router.get('/total-revenue', protect, restrictTo(roles.ADMIN), userController.totalrevenue);


module.exports = router;
