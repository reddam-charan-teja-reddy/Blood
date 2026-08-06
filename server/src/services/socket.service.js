import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import { config } from '../config/env.js';

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        const allowed = config.CORS_ORIGIN.split(',').map(o => o.trim().replace(/\/$/, ''));
        if (allowed.includes('*') || !origin || allowed.includes(origin.replace(/\/$/, ''))) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    },
  });

  // Optional socket authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      try {
        const decoded = verifyAccessToken(token);
        socket.user = decoded;
      } catch {
        // Continue as unauthenticated guest for public request listening
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    // If user is authenticated, join personal notification room
    if (socket.user?.userId) {
      socket.join(`user:${socket.user.userId}`);
    }

    // Join specific blood request room for real-time chat & coordination
    socket.on('join_request', (requestId) => {
      if (requestId) {
        socket.join(`request:${requestId}`);
      }
    });

    socket.on('leave_request', (requestId) => {
      if (requestId) {
        socket.leave(`request:${requestId}`);
      }
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

export function getIO() {
  return io;
}

export function emitToRequest(requestId, event, payload) {
  if (io) {
    io.to(`request:${requestId}`).emit(event, payload);
  }
}

export function emitToUser(userId, event, payload) {
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}
