let io;

module.exports = {
    init: (server) => {
        const socketIo = require('socket.io');
        io = socketIo(server, {
            cors: {
                origin: "http://localhost:5173",
                methods: ['GET', 'POST'],
            },
        });

        io.on('connection', (socket) => {
            console.log(`✅ Socket connected: ${socket.id}`);
            socket.on('client-ping', (msg) => {
                console.log(`📩 Received from client: ${msg}`);
            });
        });

        return io;
    },

    getIO: () => {
        if (!io) {
            throw new Error('Socket.io not initialized');
        }
        return io;
    },
};