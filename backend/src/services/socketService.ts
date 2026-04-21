import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { queryOne } from '../database/connection';

export function setupSocketIO(io: SocketServer): void {
  // Auth middleware for socket
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string };
      const user = await queryOne('SELECT id, role, first_name, last_name FROM users WHERE id = $1', [decoded.userId]);
      if (!user) return next(new Error('User not found'));
      (socket as any).user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    console.log(`Socket connected: ${user.first_name} ${user.last_name} (${user.role})`);

    // Join user-specific room
    socket.join(`user:${user.id}`);

    // Join role room
    socket.join(`role:${user.role}`);

    // Join merchant room when viewing a merchant
    socket.on('join:merchant', (merchantId: string) => {
      socket.join(`merchant:${merchantId}`);
    });

    socket.on('leave:merchant', (merchantId: string) => {
      socket.leave(`merchant:${merchantId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${user.first_name} ${user.last_name}`);
    });
  });
}
