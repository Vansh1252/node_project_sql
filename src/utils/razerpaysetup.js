const Razorpay = require('razorpay');

const razorpay = new Razorpay({
    key_id: process.env.KEY_ID_RAZORPAY_TEST,
    key_secret: process.env.KEY_SECRET_RAZORPAY_TEST,
});

module.exports = razorpay;