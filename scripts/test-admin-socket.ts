import { io } from 'socket.io-client';

const socket = io('http://localhost:3007/admin', {
  transports: ['websocket'],
  auth: {
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTg0NDQ2ZDM5NDY5YjBkODkxNzA0NjIiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NzAyNzczMzYsImV4cCI6MTc3MDg4MjEzNn0.2LnkpIVS8dWZDBb5xWolrWNNfIIzvaWPmHkFE8M528Y',
  },
});

socket.on('connect', () => {
  console.log('✅ Connected', socket.id);
  socket.emit('get-stats');
});

socket.on('stats', (data) => {
  console.log('📊 Stats', data);
});
socket.onAny((event, payload) => {
  console.log(`📨 Event received: "${event}"`);
  console.log(payload);
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected');
});
