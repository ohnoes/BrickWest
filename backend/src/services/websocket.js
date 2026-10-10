import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { getBatchById } from '../models/Batch.js';

export const initializeSocket = (io, findBatch = getBatchById) => {
  io.use((socket, next) => {
    try {
      socket.user = jwt.verify(socket.handshake.auth?.token, JWT_SECRET, { algorithms: ['HS256'] });
      next();
    } catch { next(new Error('Unauthorized')); }
  });
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    const authorize = async batchId => {
      if (!Number.isSafeInteger(Number(batchId)) || Number(batchId) <= 0) return false;
      const { rows } = await findBatch(Number(batchId));
      return Boolean(rows[0] && (rows[0].brewer_id === socket.user.id || socket.user.role === 'admin'));
    };
    socket.on('join_batch', async (batchId, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      try {
        if (!await authorize(batchId)) return reply({ error: 'Forbidden' });
        await socket.join(`batch_${Number(batchId)}`);
        reply({ joined: true });
      } catch { return reply({ error: 'Unable to join batch' }); }
      console.log(`User ${socket.id} joined batch ${batchId}`);
    });

    socket.on('fermentation_update', async (data, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      try {
      if (!data || !await authorize(data.batchId)) return reply({ error: 'Forbidden' });
      const { batchId, temperature, gravity, ph, notes } = data;
      if (![temperature, gravity].every(Number.isFinite) || (ph != null && !Number.isFinite(ph)) ||
          (notes != null && (typeof notes !== 'string' || notes.length > 10000))) return reply({ error: 'Invalid reading' });
      io.to(`batch_${Number(batchId)}`).emit('fermentation_update', {
        timestamp: new Date().toISOString(),
        temperature, gravity, ph, notes
      });
      reply({ sent: true });
      } catch { reply({ error: 'Unable to update batch' }); }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};
