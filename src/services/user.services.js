const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, db } = require('../utils/db');
const { generateToken, verifyToken } = require('../utils/genratetoken');
const mailer = require('../utils/mailer');
const AppError = require('../utils/AppError');
const moment = require('moment');
const { roles, userStatus, status, paymentstatus, slotstatus, tables } = require('../constants/sequelizetableconstants');

// REGISTER USER
exports.registerUser = async ({ fullName, email, password, role }) => {
    const transaction = await sequelize.transaction();
    try {
        const existingUser = await db.User.findOne({ where: { str_email: email }, transaction });
        if (existingUser) throw new AppError('User with this email already exists.', 409);

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await db.User.create(
            {
                str_fullName: fullName,
                str_email: email,
                str_password: hashedPassword,
                str_role: role,
                str_status: userStatus.ACTIVE,
            },
            { transaction }
        );

        let profileInstance = null;

        await mailer.sendMail({
            to: email,
            from: process.env.EMAIL_FROM,
            subject: 'Welcome to Viva Phonics!',
            text:
                `Hello ${fullName},\n\nWelcome to our platform! Your account has been successfully created.` +
                (profileInstance ? `\n\nYour temporary profile has been initiated.` : '') +
                `\n\nLogin to the platform at: ${process.env.FRONTEND_URL}/login` +
                `\n\n(If this account was created by an admin, please contact them for your initial password if not provided.)`,
        });

        await transaction.commit();
        return { statusCode: 201, message: 'User registered successfully.', userId: user.id };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in registerUser service:', error);
        throw error;
    }
};

// LOGIN USER
exports.loginUser = async (req) => {
    const transaction = await sequelize.transaction();
    try {
        const { email, password } = req.body;
        const user = await db.User.findOne({ where: { str_email: email }, transaction });
        if (!user) throw new AppError('Invalid email', 400);

        const isMatch = await bcrypt.compare(password, user.str_password);
        if (!isMatch) throw new AppError('Invalid password.', 400);

        if (user.str_status !== userStatus.ACTIVE) {
            throw new AppError('Your account is not active. Please contact support.', 403);
        }

        const payload = { id: user.id, role: user.str_role, email: user.str_email };
        const accessToken = generateToken(payload, '1h');
        const refreshTokenValue = generateToken(payload, '7d');

        await db.RefreshToken.create(
            {
                str_refreshToken: refreshTokenValue,
                str_device: req.headers['user-agent'] || 'unknown',
                str_ip: req.ip || 'unknown',
                userId: user.id,
            },
            { transaction }
        );

        await transaction.commit();
        return {
            statusCode: 200,
            message: 'Login successful',
            accessToken,
            refreshToken: refreshTokenValue,
            user: { id: user.id, email: user.str_email, fullName: user.str_fullName, role: user.str_role },
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in loginUser service:', error);
        throw error;
    }
};

// LOGOUT (Single Device)
exports.logoutSingleDeviceService = async (refreshToken) => {
    const transaction = await sequelize.transaction();
    try {
        if (!refreshToken) throw new AppError('No refresh token provided.', 400);

        const deletedCount = await db.RefreshToken.destroy({
            where: { str_refreshToken: refreshToken },
            transaction,
        });

        await transaction.commit();
        return {
            statusCode: deletedCount === 0 ? 204 : 200,
            message: deletedCount === 0 ? 'No content — token not found or already logged out.' : 'Logged out successfully.',
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in logoutSingleDeviceService:', error);
        throw error;
    }
};

// LOGOUT ALL DEVICES
exports.logoutAllDevicesService = async (refreshToken) => {
    const transaction = await sequelize.transaction();
    try {
        if (!refreshToken) throw new AppError('No refresh token provided.', 400);

        const tokenRecord = await db.RefreshToken.findOne({ where: { str_refreshToken: refreshToken }, transaction });
        if (!tokenRecord) {
            await transaction.commit();
            return { statusCode: 204, message: 'No content — token not found.' };
        }

        await db.RefreshToken.destroy({
            where: { userId: tokenRecord.userId },
            transaction,
        });

        await transaction.commit();
        return { statusCode: 200, message: 'Logged out from all devices.' };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in logoutAllDevicesService:', error);
        throw error;
    }
};

// GET PROFILE
exports.getProfile = async (userId) => {
    validateUserId(userId);
    const transaction = await sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, {
            attributes: ['id', 'str_email', 'str_fullName', 'str_role', 'str_status', 'obj_profileId', 'str_profileType'],
            include: [
                {
                    model: db.Student,
                    as: 'studentProfile',
                    required: false,
                    where: { '$User.str_profileType$': tables.STUDENT, '$User.obj_profileId$': { [Op.col]: 'studentProfile.id' } },
                },
                {
                    model: db.Tutor,
                    as: 'tutorProfile',
                    required: false,
                    where: { '$User.str_profileType$': tables.TUTOR, '$User.obj_profileId$': { [Op.col]: 'tutorProfile.id' } },
                },
            ],
            transaction,
        });

        if (!user) throw new AppError('User not found.', 404);
        await transaction.commit();
        return {
            statusCode: 200,
            user: {
                id: user.id,
                email: user.str_email,
                fullName: user.str_fullName,
                role: user.str_role,
                status: user.str_status,
                profile: profileDetails,
            },
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in getProfile service:', error);
        throw error;
    }
};

// UPDATE PROFILE
exports.updateUser = async (userId, updateData) => {
    validateUserId(userId);
    const transaction = await sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) throw new AppError('User not found.', 404);

        const { fullName, email, status: newStatus } = updateData;

        if (email && email !== user.str_email) {
            const existingEmailUser = await db.User.findOne(
                {
                    where: { str_email: email, id: { [Op.ne]: userId } },
                    transaction,
                },
                { transaction }
            );
            if (existingEmailUser) throw new AppError('Email already exists.', 409);
        }

        const userUpdateFields = {};
        if (fullName !== undefined) userUpdateFields.str_fullName = fullName;
        if (email !== undefined) userUpdateFields.str_email = email;
        if (newStatus && [userStatus.ACTIVE, userStatus.INACTIVE].includes(newStatus)) {
            userUpdateFields.str_status = newStatus;
        }
        await user.update(userUpdateFields, { transaction });

        await transaction.commit();
        return {
            statusCode: 200,
            message: 'Profile updated successfully',
            data: user.toJSON(),
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in updateUser service:', error);
        throw error;
    }
};

// SEND PASSWORD RESET LINK
exports.sendPasswordResetLink = async (email) => {
    const transaction = await sequelize.transaction();
    try {
        const user = await db.User.findOne({ where: { str_email: email }, transaction });
        if (!user) throw new AppError('User not found.', 404);

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        await user.update(
            {
                resetToken: resetTokenHash,
                resetTokenExpiration: moment().add(1, 'hour').toDate(),
            },
            { transaction }
        );

        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
        await mailer.sendMail({
            to: email,
            from: process.env.EMAIL_FROM,
            subject: 'Password Reset',
            html: `<p>You requested a password reset</p><p>Click this <a href="${resetUrl}">link</a> to set a new password. This link will expire in 1 hour.</p>`,
        });

        await transaction.commit();
        return { statusCode: 200, message: 'Password reset link sent to your email.' };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in sendPasswordResetLink service:', error);
        throw error;
    }
};

// SET NEW PASSWORD
exports.setNewPassword = async (token, newPassword) => {
    const transaction = await sequelize.transaction();
    try {
        if (!token || typeof token !== 'string') throw new AppError('Token is required.', 422);
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) throw new AppError('New password must be at least 8 characters long.', 400);

        const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const user = await db.User.findOne(
            {
                where: {
                    resetToken: resetTokenHash,
                    resetTokenExpiration: { [Op.gt]: moment().toDate() },
                },
                transaction,
            },
            { transaction }
        );
        if (!user) throw new AppError('Token is invalid or has expired.', 400);

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await user.update(
            {
                str_password: hashedPassword,
                resetToken: null,
                resetTokenExpiration: null,
            },
            { transaction }
        );

        await transaction.commit();
        return { statusCode: 200, message: 'Password has been reset successfully.' };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in setNewPassword service:', error);
        throw error;
    }
};

// UPDATE PASSWORD
exports.updatePassword = async (userId, currentPassword, newPassword) => {
    validateUserId(userId);
    const transaction = await sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) throw new AppError('User not found.', 404);

        if (!currentPassword || typeof currentPassword !== 'string') throw new AppError('Current password is required.', 422);
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) throw new AppError('New password must be at least 8 characters long.', 400);

        const isMatch = await bcrypt.compare(currentPassword, user.str_password);
        if (!isMatch) throw new AppError('Current password is incorrect.', 401);

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await user.update({ str_password: hashedPassword }, { transaction });

        await transaction.commit();
        return { statusCode: 200, message: 'Password updated successfully.' };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in updatePassword service:', error);
        throw error;
    }
};

// GET ADMIN DASHBOARD
exports.getAdminDashboard = async () => {
    const transaction = await sequelize.transaction();
    try {
        const totalActiveStudents = await db.Student.count({
            where: { str_status: userStatus.ACTIVE },
            transaction,
        });

        const studentsOnLeave = await db.Student.count({
            where: { str_status: userStatus.PAUSED },
            transaction,
        });

        const totalActiveTutors = await db.Tutor.count({
            where: { str_status: userStatus.ACTIVE },
            transaction,
        });

        const weeklyProfitSum = await db.Payment.sum('int_totalAmount', {
            where: {
                str_status: paymentstatus.COMPLETED,
                created_at: { [Op.gte]: moment().subtract(7, 'days').toDate() },
            },
            transaction,
        });

        const monthlyProfitSum = await db.Payment.sum('int_totalAmount', {
            where: {
                str_status: paymentstatus.COMPLETED,
                created_at: { [Op.gte]: moment().subtract(30, 'days').toDate() },
            },
            transaction,
        });

        const recentStudents = await db.Student.findAll({
            limit: 10,
            order: [['created_at', 'DESC']],
            attributes: ['id', 'int_studentNumber', 'str_firstName', 'str_lastName', 'str_status', 'dt_startDate', 'dt_dischargeDate', 'str_email'],
            include: [
                {
                    model: db.Tutor,
                    as: 'assignedTutor',
                    attributes: ['str_firstName', 'str_lastName'],
                    required: false,
                },
            ],
            transaction,
        });

        const profitWeek = weeklyProfitSum || 0;
        const profitMonth = monthlyProfitSum || 0;

        const formattedRecentStudents = recentStudents.map((student) => ({
            _id: student.id,
            studentNumber: student.int_studentNumber,
            firstName: student.str_firstName,
            lastName: student.str_lastName,
            email: student.str_email,
            status: student.str_status,
            startDate: student.dt_startDate,
            dischargeDate: student.dt_dischargeDate,
            assignedTutorName: student.assignedTutor
                ? `${student.assignedTutor.str_firstName} ${student.assignedTutor.str_lastName}`.trim()
                : 'Not Assigned',
        }));

        await transaction.commit();
        return {
            statusCode: 200,
            data: {
                totalActiveStudents,
                onLeaveStudents: studentsOnLeave,
                totalTutors: totalActiveTutors,
                profitWeek,
                profitMonth,
                recentStudents: formattedRecentStudents,
            },
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in getAdminDashboard:', error);
        throw new AppError(`Failed to load dashboard data: ${error.message}`, 500);
    }
};

// REFRESH TOKEN
exports.refreshToken = async (req) => {
    const transaction = await sequelize.transaction();
    try {
        const refreshTokenValue = req.cookies?.refreshToken;
        if (!refreshTokenValue) throw new AppError('No refresh token provided.', 401);

        const decoded = verifyToken(refreshTokenValue);
        if (!decoded?.id) throw new AppError('Invalid refresh token.', 401);

        const user = await db.User.findByPk(decoded.id, { transaction });
        if (!user) throw new AppError('User not found.', 404);

        const tokenRecord = await db.RefreshToken.findOne(
            {
                where: {
                    userId: user.id,
                    str_refreshToken: refreshTokenValue,
                },
                transaction,
            },
            { transaction }
        );

        if (!tokenRecord) {
            await db.RefreshToken.destroy({ where: { userId: user.id }, transaction });
            throw new AppError('Invalid refresh token. Please log in again.', 401);
        }

        const newAccessToken = generateToken({ id: user.id, role: user.str_role, email: user.str_email }, '1h');
        const newRefreshTokenValue = generateToken({ id: user.id, role: user.str_role, email: user.str_email }, '7d');

        await tokenRecord.update(
            {
                str_refreshToken: newRefreshTokenValue,
                str_device: req.headers['user-agent'] || 'unknown',
                str_ip: req.ip || 'unknown',
            },
            { transaction }
        );

        await transaction.commit();
        return {
            statusCode: 200,
            message: 'Token refreshed successfully',
            accessToken: newAccessToken,
            refreshToken: newRefreshTokenValue,
            user: {
                id: user.id,
                email: user.str_email,
                fullName: user.str_fullName,
                role: user.str_role,
            },
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in refreshToken service:', error);
        throw error;
    }
};

// DELETE USER
exports.deleteUser = async (userId) => {
    const transaction = await sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) throw new AppError('User not found.', 404);

        await db.RefreshToken.destroy({ where: { userId: user.id }, transaction });

        if (user.obj_profileId && user.str_profileType) {
            if (user.str_profileType === tables.STUDENT) {
                await db.Student.destroy({ where: { id: user.obj_profileId }, transaction });
            } else if (user.str_profileType === tables.TUTOR) {
                await db.Tutor.destroy({ where: { id: user.obj_profileId }, transaction });
            }
        }

        await user.destroy({ transaction });

        await transaction.commit();
        return { statusCode: 200, message: 'User and associated data deleted successfully.' };
    } catch (error) {
        await transaction.rollback();
        console.error('Error in deleteUser service:', error);
        throw error;
    }
};