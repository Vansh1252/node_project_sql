// src/services/user.services.js
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { db } = require('../utils/db'); // ✅ Import the db object
const { generateToken } = require('../utils/genratetoken');
const mailer = require('../utils/mailer');
const AppError = require('../utils/AppError');
const { roles, userStatus, slotstatus } = require('../constants/sequelizetableconstants'); // ✅ Use Sequelize constants
const { Op } = require('sequelize'); // ✅ Import Sequelize Operators

// REGISTER
exports.registerUser = async ({ fullName, email, password, role }) => {
    // Find existing user by email
    const existingUser = await db.User.findOne({ where: { str_email: email } });
    if (existingUser) {
        throw new AppError('User already exists', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Create the user
    const user = await db.User.create({
        str_fullName: fullName,
        str_email: email,
        str_password: hashedPassword,
        str_role: role || roles.ADMIN // Default to ADMIN if not provided
    });

    let profileId = null;
    let profileType = null;

    // Create corresponding profile based on role
    if (role === roles.STUDENT) {
        const student = await db.Student.create({
            str_firstName: fullName.split(' ')[0],
            str_lastName: fullName.split(' ')[1] || '',
            objectId_createdBy: user.id // ✅ Use user.id
            // Other required student fields will need to be provided or have defaults
            // e.g., int_studentNumber, str_familyName, str_grade, str_year,
            // str_email, str_phoneNumber, str_address, str_city, str_state, str_country, dt_startDate
        });
        profileId = student.id; // ✅ Use student.id
        profileType = roles.STUDENT;
    } else if (role === roles.TUTOR) {
        const tutor = await db.Tutor.create({
            str_firstName: fullName.split(' ')[0],
            str_lastName: fullName.split(' ')[1] || '',
            objectId_createdBy: user.id // ✅ Use user.id
            // Other required tutor fields will need to be provided or have defaults
            // e.g., str_email, str_phoneNumber, str_address, str_city, str_province,
            // str_postalCode, str_country, int_rate, str_timezone
        });
        profileId = tutor.id; // ✅ Use tutor.id
        profileType = roles.TUTOR;
    }

    // Update the User with the profileId and profileType if a profile was created
    if (profileId) {
        await user.update({
            profileId: profileId,
            profileType: profileType
        });
    }

    // Send welcome email
    await mailer.sendMail({
        to: email,
        from: 'vanshsanklecha36@gmail.com', // Ensure this is configured in your mailer
        subject: 'Welcome to Our Platform!',
        text: `Hello ${fullName},\n\nWelcome to our platform! We're glad to have you.`
    });

    return { statusCode: 201, message: 'User registered successfully' };
};

// LOGIN
exports.loginUser = async (req) => {
    const { email, password } = req.body;
    console.log(email)
    // Find user by email
    const user = await db.User.findOne({ where: { str_email: email } });
    if (!user) {
        throw new AppError('Invalid email', 400);
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.str_password);
    if (!isMatch) {
        throw new AppError('Invalid email or password', 400);
    }

    // Generate token
    const payload = {
        id: user.id, // ✅ Use user.id
        role: user.str_role,
        email: user.str_email, // Use str_email from the model
    };

    const token = generateToken(payload);

    return {
        token,
        user: {
            id: user.id, // ✅ Use user.id
            email: user.str_email,
            fullName: user.str_fullName,
            role: user.str_role
        }
    };
};

// UPDATE PROFILE
exports.updateUser = async (userId, req) => {
    const { fullName, email, status, profileId } = req.body; // Removed phoneNumber as it's not on User model
    if (!userId) {
        throw new AppError("Unauthorized access", 401);
    }

    // Check for existing email (excluding current user)
    const existingEmail = await db.User.findOne({
        where: {
            str_email: email,
            id: { [Op.ne]: userId } // ✅ Sequelize Op.ne for not equal
        }
    });
    if (existingEmail) {
        throw new AppError('Email already exists', 409);
    }

    // Find the user by primary key
    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new AppError("User not found", 404);
    }

    // Prepare update data for User model
    const userUpdateData = {};
    if (fullName) userUpdateData.str_fullName = fullName;
    if (email) userUpdateData.str_email = email;
    if (status && [userStatus.ACTIVE, userStatus.INACTIVE].includes(status)) {
        userUpdateData.str_status = status;
    }
    // Apply updates to User model
    if (Object.keys(userUpdateData).length > 0) {
        await user.update(userUpdateData); // ✅ Update instance
    }
    if (profileId) { // No need for mongoose.Types.ObjectId.isValid, as UUIDs are strings
        // Update corresponding profile model based on role
        if (user.str_role === roles.STUDENT) {
            await db.Student.update(
                { str_firstName: fullName }, // Only update firstName, as other fields are not passed
                { where: { id: profileId } } // ✅ Update by profileId
            );
        } else if (user.str_role === roles.TUTOR) {
            await db.Tutor.update(
                { str_firstName: fullName }, // Only update firstName
                { where: { id: profileId } } // ✅ Update by profileId
            );
        }
        // Also update the user's profileId and profileType if they are being changed
        await user.update({
            obj_profileId: profileId,
            obj_profileType: user.str_role === roles.STUDENT ? roles.STUDENT : roles.TUTOR
        });
    }
    // Return updated user data
    return {
        statusCode: 200,
        message: "Profile updated successfully",
        data: {
            id: user.id, // ✅ Use user.id
            fullName: user.str_fullName,
            email: user.str_email,
            status: user.str_status,
            role: user.str_role
        }
    };
};

// SEND PASSWORD RESET LINK (HTML VERSION)
exports.sendPasswordResetLink = async (email) => {
    // Find user by email
    const user = await db.User.findOne({ where: { str_email: email } });
    if (!user) {
        throw new AppError("User not found", 404);
    }

    // Generate reset token and hash
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Update user with reset token and expiration
    await user.update({
        str_resetToken: resetTokenHash,
        str_resetTokenExpiration: new Date(Date.now() + 3600000)
    });

    const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;
    console.log(resetToken); // For debugging, remove in production

    // Send reset email
    await mailer.sendMail({
        to: email,
        from: 'vanshsanklecha36@gmail.com',
        subject: 'Password Reset',
        html: `
            <p>You requested a password reset</p>
            <p>Click this <a href="${resetUrl}">link</a> to set a new password. This link will expire in 1 hour.</p>
        `
    });

    return { message: 'Password reset link sent to your email.' };
};

// SET NEW PASSWORD
exports.setNewPassword = async (token, newPassword) => {
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user by reset token and ensure it's not expired
    const user = await db.User.findOne({
        where: {
            str_resetToken: resetTokenHash,
            str_resetTokenExpiration: { [Op.gt]: new Date() }
        }
    });
    if (!user) {
        throw new AppError('Token is invalid or has expired', 400); // Changed error message to be more specific
    }

    // Hash new password and clear reset token fields
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await user.update({ // ✅ Update instance
        str_password: hashedPassword,
        str_resetToken: null, // Set to null instead of undefined
        str_resetTokenExpiration: null // Set to null instead of undefined
    });

    return { message: 'Password has been reset successfully' };
};

// admin dashboard
exports.getAdminDashboard = async () => {
    try {
        // Use Promise.all for concurrent queries
        const [userCount, tutorCount, studentCount, recentActivity] = await Promise.all([
            // Count all users (admin, tutor, student roles)
            db.User.count({
                where: {
                    str_role: {
                        [Op.in]: [roles.ADMIN, roles.TUTOR, roles.STUDENT] // ✅ Op.in for array of values
                    }
                }
            }),
            // Count active tutors
            db.Tutor.count({ where: { str_status: userStatus.ACTIVE } }), // ✅ Use status constant
            // Count active students
            db.Student.count({ where: { str_status: userStatus.ACTIVE } }), // ✅ Use status constant
            // Get recent activity (slots)
            db.Slot.findAll({
                where: {
                    str_status: {
                        [Op.in]: [slotstatus.BOOKED, slotstatus.COMPLETED] // Assuming slotstatus is available
                    }
                },
                order: [['updatedAt', 'DESC']], // ✅ Sequelize order syntax
                limit: 5,
                include: [
                    {
                        model: db.Tutor,
                        as: 'tutor', // Alias from Slot model association
                        attributes: ['str_firstName', 'str_lastName']
                    },
                    {
                        model: db.Student,
                        as: 'student', // Alias from Slot model association
                        attributes: ['str_firstName', 'str_lastName'],
                        required: false // LEFT JOIN, as student can be null
                    }
                ]
            })
        ]);

        return {
            statusCode: 200,
            data: {
                totalUsers: userCount,
                activeTutors: tutorCount,
                activeStudents: studentCount,
                recentActivity: recentActivity.map(slot => ({
                    slotId: slot.id, // ✅ Use slot.id
                    tutor: slot.tutor ? `${slot.tutor.str_firstName} ${slot.tutor.str_lastName}` : null, // ✅ Access via alias
                    student: slot.student ? `${slot.student.str_firstName} ${slot.student.str_lastName}` : null, // ✅ Access via alias
                    date: slot.dt_date,
                    status: slot.str_status
                }))
            }
        };
    } catch (error) {
        console.error("Error fetching admin dashboard data:", error); // Log the actual error
        throw new AppError(`Failed to fetch dashboard data: ${error.message}`, 500);
    }
};

// update password
exports.updatePassword = async (userId, currentPassword, newPassword) => {
    // Find user by primary key
    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new AppError('User not found', 404);
    }

    // Compare current password
    const isMatch = await bcrypt.compare(currentPassword, user.str_password);
    if (!isMatch) {
        throw new AppError('Current password is incorrect', 401);
    }

    // Hash new password and update user
    user.str_password = await bcrypt.hash(newPassword, 12);
    await user.save(); // ✅ Save the instance

    return { statusCode: 200, message: 'Password updated successfully' };
};

// refreshToken
exports.refreshToken = async (userId) => {
    // Find user by primary key
    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new AppError('User not found', 404);
    }

    // Generate new token
    const payload = {
        id: user.id, // ✅ Use user.id
        role: user.str_role,
        email: user.str_email
    };
    const token = generateToken(payload);

    return { statusCode: 200, token };
};

// delete user
exports.deleteUser = async (userId) => {
    if (!userId) {
        throw new AppError("User ID is required for deletion.", 400);
    }

    const transaction = await db.sequelize.transaction();
    try {
        const user = await db.User.findByPk(userId, { transaction });
        if (!user) {
            throw new AppError("User not found", 404);
        }

        // 1. Handle associated Student/Tutor profile
        if (user.obj_profileId && user.obj_profileType) {
            if (user.obj_profileType === roles.STUDENT) {
                const student = await db.Student.findByPk(user.obj_profileId, { transaction });
                if (student) {
                    // Remove from assigned tutor
                    if (student.objectId_assignedTutor) {
                        const tutor = await db.Tutor.findByPk(student.objectId_assignedTutor, { transaction });
                        if (tutor) {
                            await db.sequelize.models.TutorStudents.destroy({
                                where: {
                                    obj_tutorId: tutor.id,
                                    obj_studentId: student.id
                                },
                                transaction
                            });
                        }
                    }

                    // Delete availability slots
                    await db.AvailabilitySlot.destroy({
                        where: {
                            obj_entityId: student.id,
                            obj_entityType: roles.STUDENT
                        },
                        transaction
                    });

                    await student.destroy({ transaction });
                }
            } else if (user.obj_profileType === roles.TUTOR) {
                const tutor = await db.Tutor.findByPk(user.obj_profileId, { transaction });
                if (tutor) {
                    // Remove tutor reference from students
                    await db.Student.update(
                        { objectId_assignedTutor: null },
                        { where: { objectId_assignedTutor: tutor.id }, transaction }
                    );

                    // Delete join table entries
                    await db.sequelize.models.TutorStudents.destroy({
                        where: { obj_tutorId: tutor.id },
                        transaction
                    });

                    // Delete availability slots
                    await db.AvailabilitySlot.destroy({
                        where: {
                            obj_entityId: tutor.id,
                            obj_entityType: roles.TUTOR
                        },
                        transaction
                    });

                    await tutor.destroy({ transaction });
                }
            }
        }

        // 2. Delete Slots created by user
        await db.Slot.destroy({
            where: { objectId_createdBy: userId },
            transaction
        });

        // 3. Delete User
        await user.destroy({ transaction });

        await transaction.commit();
        return { statusCode: 200, message: "User and all associated data deleted successfully." };

    } catch (error) {
        await transaction.rollback();
        console.error("Error deleting user:", error);
        throw new AppError(`Failed to delete user: ${error.message}`, 500);
    }
};
