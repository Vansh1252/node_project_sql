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
router.get('/me', protect, userController.getProfile);
router.put('/update', protect, validateUpdateUser, validate, userController.updateProfile);
router.post('/forgot-password', userController.sendPasswordResetLink);
router.post('/reset-password', userController.setNewPassword);
router.post('/logout', userController.logout);
router.put('/update-password', protect, userController.updatePassword);
router.post('/refresh-token', protect, userController.refreshToken);
router.get('/dashboard/admin', protect, restrictTo(roles.ADMIN), userController.getAdminDashboard);
router.delete('/delete/:id', protect, restrictTo('admin'), userController.deleteUser);

module.exports = router;
