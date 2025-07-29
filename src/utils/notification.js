const { getIO } = require('../../socket');
const mailer = require('./mailer');

const notifySocket = (event, data) => {
    const io = getIO();
    if (io) io.emit(event, data);
};

const notifyEmail = async (to, subject, text, html = null) => {
    try {
        await mailer.sendMail({
            to,
            from: 'vanshsanklecha36@gmail.com',
            subject,
            text,
            html
        });
    } catch (error) {
        console.error(`Email notification failed: ${error.message}`);
    }
};

module.exports = { notifySocket, notifyEmail };