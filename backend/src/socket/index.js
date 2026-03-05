const { socketAuth } = require('../middleware/auth');
const GameHandler = require('./gameHandler');
const MatchmakingHandler = require('./matchmakingHandler');

const initializeSocket = (io) => {
  io.use(socketAuth);

  const gameHandler = new GameHandler(io);
  const matchmakingHandler = new MatchmakingHandler(io);
  io.matchmakingHandler = matchmakingHandler;

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.id})`);

    gameHandler.initialize(socket);
    matchmakingHandler.initialize(socket);

    socket.emit('connected', {
      message: 'Connected to Science Bowl Online',
      user: {
        id: socket.user._id,
        username: socket.user.username,
        rating: socket.user.rating
      }
    });

    socket.on('ping', () => {
      socket.emit('pong');
    });

    socket.on('matchmaking:stats', () => {
      socket.emit('matchmaking:stats', matchmakingHandler.getQueueStats());
    });

    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${socket.user.username} - ${reason}`);
    });
  });

  // Broadcast queue stats every 10 seconds; store interval so it can be cleared on shutdown.
  const statsInterval = setInterval(() => {
    io.emit('matchmaking:stats', matchmakingHandler.getQueueStats());
  }, 10000);

  io.statsInterval = statsInterval;

  return io;
};

module.exports = initializeSocket;
