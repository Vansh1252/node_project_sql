const request = require('supertest');
const app = require('../../app');
const db = require('./models');
const { generateAuthToken } = require('./utlis');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const moment = require('moment');
const { generateToken } = require('../utils/genratetoken');

jest.mock('../utils/mailer', () => ({
    sendMail: jest.fn().mockResolvedValue(true)
}));

describe('User Routes (Sequelize Style)', () => {
    beforeEach(async () => {
        console.log("Syncing and cleaning database");
        await db.sequelize.sync({ force: true });
        const users = await db.User.findAll();
        expect(users).toHaveLength(0);
    });

    describe('POST /api/auth/register', () => {
        it('should fail validation for invalid email', async () => {
            const res = await request(app).post('/api/auth/register').send({
                fullName: 'Test User',
                email: 'not-an-email',
                password: 'Test@1234',
                role: 'admin'
            });

            expect(res.statusCode).toBe(422);
            expect(res.body.message).toBe('Invalid email format.');
        });

        it('should register a new user successfully', async () => {
            const res = await request(app).post('/api/auth/register').send({
                fullName: 'Test User',
                email: 'testuser@example.com',
                password: 'Test@1234',
                role: 'admin'
            });

            expect(res.statusCode).toBe(201);
            expect(res.body.message).toBe('User registered successfully.');
            const user = await db.User.findOne({ where: { str_email: 'testuser@example.com' } });
            expect(user).toBeDefined();
            expect(user.str_role).toBe('admin');
        });

        it('should return 409 if email already exists', async () => {
            await db.User.create({
                str_fullName: 'Existing User',
                str_email: 'duplicate@example.com',
                str_password: await bcrypt.hash('Pass@123', 12),
                str_role: 'admin'
            });

            const res = await request(app).post('/api/auth/register').send({
                fullName: 'New User',
                email: 'duplicate@example.com',
                password: 'Test@1234',
                role: 'admin'
            });

            expect(res.statusCode).toBe(409);
            expect(res.body.message).toBe('User with this email already exists.');
        });

        it('should return 422 if password is weak', async () => {
            const res = await request(app).post('/api/auth/register').send({
                fullName: 'Test User',
                email: 'weakpass@example.com',
                password: 'weak',
                role: 'admin'
            });

            expect(res.statusCode).toBe(422);
            expect(res.body.message).toBe('Password must be at least 8 characters long.');
        });
    });

    describe('POST /api/auth/login', () => {
        beforeEach(async () => {
            const hashedPassword = await bcrypt.hash('Password@123', 12);
            await db.User.create({
                str_fullName: 'Login User',
                str_email: 'loginuser@example.com',
                str_password: hashedPassword,
                str_role: 'admin',
                arr_refreshTokens: []
            });
        });

        it('should login successfully with correct credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'loginuser@example.com',
                    password: 'Password@123'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe('Login successful');
            expect(res.body.accessToken).toBeDefined();
            expect(res.body.user).toBeDefined();
            expect(res.body.user.email).toBe('loginuser@example.com');
            expect(res.headers['set-cookie']).toBeDefined();
        });

        it('should fail login with wrong password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'loginuser@example.com',
                    password: 'WrongPassword'
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe('Invalid password.');
        });

        it('should fail login with non-existing email', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexist@example.com',
                    password: 'Password@123'
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe('Invalid email');
        });

        it('should return 422 if email or password is missing', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'loginuser@example.com' });

            expect(res.statusCode).toBe(422);
            expect(res.body.message).toBe('Password is required.');
        });
    });

    describe('GET /api/auth/me', () => {
        let token;
        let userId;

        beforeEach(async () => {
            const hashedPassword = await bcrypt.hash('Password@123', 12);
            const user = await db.User.create({
                str_fullName: 'Profile User',
                str_email: 'profileuser@example.com',
                str_password: hashedPassword,
                str_role: 'admin',
                arr_refreshTokens: []
            });
            userId = user.id;
            token = generateAuthToken(userId, 'admin');
        });

        it('should return user profile with valid token', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('id', userId);
            expect(res.body).toHaveProperty('email', 'profileuser@example.com');
            expect(res.body).toHaveProperty('fullName', 'Profile User');
            expect(res.body).toHaveProperty('role', 'admin');
        });

        it('should return 401 if no token provided', async () => {
            const res = await request(app).get('/api/auth/me');
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Unauthorized, JWT token is required');
        });

        it('should return 403 if token is invalid', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalidtokenhere');

            expect(res.statusCode).toBe(403);
            expect(res.body.message).toBe('Token is invalid or expired');
        });
    });

    describe('PUT /api/auth/update', () => {
        let token;
        let userId;

        beforeEach(async () => {
            const hashedPassword = await bcrypt.hash('Password@123', 12);
            const user = await db.User.create({
                str_fullName: 'Update User',
                str_email: 'updateuser@example.com',
                str_password: hashedPassword,
                str_role: 'admin',
                arr_refreshTokens: []
            });
            userId = user.id;
            token = generateAuthToken(userId, 'admin');
        });

        it('should update user profile with valid data and token', async () => {
            const res = await request(app)
                .put('/api/auth/update')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    fullName: 'Updated Name',
                    email: 'updatedemail@example.com'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe('Profile updated successfully');
            expect(res.body.data.str_fullName).toBe('Updated Name');
            expect(res.body.data.str_email).toBe('updatedemail@example.com');

            const updatedUser = await db.User.findByPk(userId);
            expect(updatedUser.str_fullName).toBe('Updated Name');
            expect(updatedUser.str_email).toBe('updatedemail@example.com');
        });

        it('should return 422 if email is missing or invalid', async () => {
            const res = await request(app)
                .put('/api/auth/update')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    fullName: 'No Email User'
                });

            expect(res.statusCode).toBe(422);
            expect(res.body.message).toBe('Full name is required.');
        });

        it('should return 401 if no token provided', async () => {
            const res = await request(app)
                .put('/api/auth/update')
                .send({
                    fullName: 'No Token User',
                    email: 'noToken@example.com'
                });

            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Unauthorized, JWT token is required');
        });
    });

    describe('POST /api/auth/logout', () => {
        let refreshToken;

        beforeEach(async () => {
            const hashedPassword = await bcrypt.hash('Password@123', 12);
            const user = await db.User.create({
                str_fullName: 'Logout User',
                str_email: 'logoutuser@example.com',
                str_password: hashedPassword,
                str_role: 'admin',
                arr_refreshTokens: []
            });

            const payload = { id: user.id, role: user.str_role, email: user.str_email };
            refreshToken = generateToken(payload, '7d');

            await db.RefreshToken.create({
                str_refreshToken: refreshToken,
                str_device: 'test-device',
                str_ip: '127.0.0.1',
                userId: user.id
            });
        });

        it('should logout successfully with valid refresh token', async () => {
            const res = await request(app)
                .post('/api/auth/logout')
                .set('Cookie', `refreshToken=${refreshToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe('Logged out successfully.');
            expect(res.headers['set-cookie']).toContainEqual(expect.stringContaining('refreshToken=;'));

            const tokenRecord = await db.RefreshToken.findOne({ where: { str_refreshToken: refreshToken } });
            expect(tokenRecord).toBeNull();
        });

        it('should return 204 if refresh token is not found', async () => {
            const res = await request(app)
                .post('/api/auth/logout')
                .set('Cookie', `refreshToken=invalidtoken`);

            expect(res.statusCode).toBe(204);
            expect(res.body.message).toBe('No content — token not found or already logged out.');
        });

        it('should return 400 if no refresh token provided', async () => {
            const res = await request(app).post('/api/auth/logout');
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe('No refresh token provided.');
        });
    });

    describe('POST /api/auth/logout-all', () => {
        let refreshToken;
        let userId;

        beforeEach(async () => {
            const hashedPassword = await bcrypt.hash('Password@123', 12);
            const user = await db.User.create({
                str_fullName: 'Logout All User',
                str_email: 'logoutalluser@example.com',
                str_password: hashedPassword,
                str_role: 'admin',
                arr_refreshTokens: []
            });
            userId = user.id;

            const payload = { id: user.id, role: user.str_role, email: user.str_email };
            refreshToken = generateToken(payload, '7d');

            await db.RefreshToken.create({
                str_refreshToken: refreshToken,
                str_device: 'test-device',
                str_ip: '127.0.0.1',
                userId: user.id
            });
        });

        it('should logout from all devices successfully', async () => {
            const res = await request(app)
                .post('/api/auth/logout-all')
                .set('Cookie', `refreshToken=${refreshToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe('Logged out from all devices.');
            expect(res.headers['set-cookie']).toContainEqual(expect.stringContaining('refreshToken=;'));

            const tokens = await db.RefreshToken.findAll({ where: { userId } });
            expect(tokens).toHaveLength(0);
        });

        it('should return 204 if no refresh token found', async () => {
            const res = await request(app)
                .post('/api/auth/logout-all')
                .set('Cookie', `refreshToken=invalidtoken`);

            expect(res.statusCode).toBe(204);
            expect(res.body.message).toBe('No content — token not found.');
        });

        it('should return 400 if no refresh token provided', async () => {
            const res = await request(app).post('/api/auth/logout-all');
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe('No refresh token provided.');
        });
    });

    describe('POST /api/auth/forgot-password', () => {
        beforeEach(async () => {
            const hashedPassword = await bcrypt.hash('Password@123', 12);
            await db.User.create({
                str_fullName: 'Forgot Password User',
                str_email: 'forgotuser@example.com',
                str_password: hashedPassword,
                str_role: 'admin',
                arr_refreshTokens: []
            });
        });

        it('should send password reset link successfully', async () => {
            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'forgotuser@example.com' });

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe('Password reset link sent to your email.');

            const user = await db.User.findOne({ where: { str_email: 'forgotuser@example.com' } });
            expect(user.resetToken).toBeDefined();
            expect(user.resetTokenExpiration).toBeDefined();
        });

        it('should return 404 if email does not exist', async () => {
            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'nonexistent@example.com' });

            expect(res.statusCode).toBe(404);
            expect(res.body.message).toBe('User not found.');
        });

        it('should return 422 if email is invalid', async () => {
            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'invalid-email' });

            expect(res.statusCode).toBe(422);
            expect(res.body.message).toBe('Invalid email format.');
        });
    });

    describe('POST /api/auth/reset-password', () => {
        let resetToken;
        let user;

        beforeEach(async () => {
            const hashedPassword = await bcrypt.hash('Password@123', 12);
            user = await db.User.create({
                str_fullName: 'Reset Password User',
                str_email: 'resetuser@example.com',
                str_password: hashedPassword,
                str_role: 'admin',
                arr_refreshTokens: []
            });

            resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
            await user.update({
                resetToken: resetTokenHash,
                resetTokenExpiration: moment().add(1, 'hour').toDate()
            });
        });

        it('should reset password successfully with valid token', async () => {
            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: resetToken,
                    newPassword: 'NewPassword@123'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe('Password has been reset successfully.');

            const updatedUser = await db.User.findByPk(user.id);
            const isMatch = await bcrypt.compare('NewPassword@123', updatedUser.str_password);
            expect(isMatch).toBe(true);
            expect(updatedUser.resetToken).toBeNull();
            expect(updatedUser.resetTokenExpiration).toBeNull();
        });

        it('should return 400 if token is invalid or expired', async () => {
            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: 'invalidtoken',
                    newPassword: 'NewPassword@123'
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe('Token is invalid or has expired.');
        });

        it('should return 422 if token or password is missing', async () => {
            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ newPassword: 'NewPassword@123' });

            expect(res.statusCode).toBe(422);
            expect(res.body.message).toBe('Token is required.');
        });

        it('should return 400 if new password is too short', async () => {
            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: resetToken,
                    newPassword: 'short'
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe('New password must be at least 8 characters long.');
        });
    });

    describe('POST /api/auth/refresh-token', () => {
        let refreshToken;
        let user;

        beforeEach(async () => {
            const hashedPassword = await bcrypt.hash('Password@123', 12);
            user = await db.User.create({
                str_fullName: 'Refresh Token User',
                str_email: 'refreshuser@example.com',
                str_password: hashedPassword,
                str_role: 'admin',
                arr_refreshTokens: []
            });

            const payload = { id: user.id, role: user.str_role, email: user.str_email };
            refreshToken = generateToken(payload, '7d');

            await db.RefreshToken.create({
                str_refreshToken: refreshToken,
                str_device: 'test-device',
                str_ip: '127.0.0.1',
                userId: user.id
            });
        });

        it('should refresh token successfully', async () => {
            const res = await request(app)
                .post('/api/auth/refresh-token')
                .set('Cookie', `refreshToken=${refreshToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe('Token refreshed successfully');
            expect(res.body.accessToken).toBeDefined();
            expect(res.body.user).toBeDefined();
            expect(res.body.user.email).toBe('refreshuser@example.com');
            expect(res.headers['set-cookie']).toContainEqual(expect.stringContaining('refreshToken='));
        });

        it('should return 401 if refresh token is invalid', async () => {
            const res = await request(app)
                .post('/api/auth/refresh-token')
                .set('Cookie', `refreshToken=invalidtoken`);

            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('Invalid refresh token. Please log in again.');
        });

        it('should return 401 if no refresh token provided', async () => {
            const res = await request(app).post('/api/auth/refresh-token');
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe('No refresh token provided.');
        });
    });

    describe('GET /api/auth/dashboard/admin', () => {
        let adminToken;
        let nonAdminToken;

        beforeEach(async () => {
            const hashedPasswordAdmin = await bcrypt.hash('AdminPass@123', 12);
            const adminUser = await db.User.create({
                str_fullName: 'Admin User',
                str_email: 'admin@example.com',
                str_password: hashedPasswordAdmin,
                str_role: 'admin',
                arr_refreshTokens: []
            });
            const adminPayload = { id: adminUser.id, role: adminUser.str_role, email: adminUser.str_email };
            adminToken = generateToken(adminPayload, '1h');

            const hashedPasswordUser = await bcrypt.hash('UserPass@123', 12);
            const nonAdminUser = await db.User.create({
                str_fullName: 'Regular User',
                str_email: 'user@example.com',
                str_password: hashedPasswordUser,
                str_role: 'student',
                arr_refreshTokens: []
            });
            const userPayload = { id: nonAdminUser.id, role: nonAdminUser.str_role, email: nonAdminUser.str_email };
            nonAdminToken = generateToken(userPayload, '1h');
        });

        it('should allow access to admin users', async () => {
            const res = await request(app)
                .get('/api/auth/dashboard/admin')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('totalActiveStudents');
            expect(res.body).toHaveProperty('onLeaveStudents');
            expect(res.body).toHaveProperty('totalTutors');
            expect(res.body).toHaveProperty('profitWeek');
            expect(res.body).toHaveProperty('profitMonth');
            expect(res.body).toHaveProperty('recentStudents');
        });

        it('should deny access to non-admin users', async () => {
            const res = await request(app)
                .get('/api/auth/dashboard/admin')
                .set('Authorization', `Bearer ${nonAdminToken}`);

            expect(res.statusCode).toBe(403);
            expect(res.body.message).toMatch(/access denied/i);
        });

        it('should deny access if no token provided', async () => {
            const res = await request(app).get('/api/auth/dashboard/admin');
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toMatch(/jwt token is required/i);
        });
    });
});