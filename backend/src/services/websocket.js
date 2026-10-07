export const initializeSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join_batch', (batchId) => {
      socket.join(`batch_${batchId}`);
      console.log(`User ${socket.id} joined batch ${batchId}`);
    });

    socket.on('fermentation_update', (data) => {
      const { batchId, ...update } = data;
      io.to(`batch_${batchId}`).emit('fermentation_update', {
        timestamp: new Date().toISOString(),
        ...update
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};
