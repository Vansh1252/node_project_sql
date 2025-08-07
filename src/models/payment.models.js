// models/Payment.js
const { DataTypes } = require('sequelize');
const { tables, paymentstatus } = require('../constants/sequelizetableconstants');

module.exports = (sequelize) => {
    const Payment = sequelize.define(tables.PAYMENT, {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false,
        },
        str_razorpayOrderId: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_razorpayPaymentId: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        str_razorpaySignature: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        obj_studentId: { 
            type: DataTypes.UUID,
            references: {
                model: tables.STUDENT,
                key: 'id',
            },
            allowNull: false,
        },
        obj_tutorId: { 
            type: DataTypes.UUID,
            references: {
                model: tables.TUTOR,
                key: 'id',
            },
            allowNull: false,
        },
        obj_slotId: {
            type: DataTypes.UUID,
            references: {
                model: tables.SLOT,
                key: 'id',
            },
            allowNull: true,
        },
        int_amount: { 
            type: DataTypes.INTEGER, 
            allowNull: false,
        },
        int_transactionFee: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        int_totalAmount: { 
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        int_tutorPayout: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        int_profitWeek: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        int_profitMonth: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        str_paymentMethod: {
            type: DataTypes.ENUM('Razorpay', 'Stripe', 'PayPal'), 
            allowNull: false,
        },
        str_status: {
            type: DataTypes.ENUM(paymentstatus.PENDING, paymentstatus.COMPLETED, paymentstatus.FAILED),
            defaultValue: paymentstatus.PENDING,
            allowNull: false,
        },
    }, {
        timestamps: true,
        tableName: tables.PAYMENT,
        underscored: true, 

    });
    Payment.associate = (db) => {
        Payment.belongsTo(db.Student, { foreignKey: 'obj_studentId', as: 'student' });
        Payment.belongsTo(db.Tutor, { foreignKey: 'obj_tutorId', as: 'tutor' });
        Payment.belongsTo(db.Slot, { foreignKey: 'obj_slotId', as: 'slot' });
    };
    return Payment;
};