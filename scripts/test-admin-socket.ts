import { io } from 'socket.io-client';

const socket = io('http://localhost:3007/admin', {
  transports: ['websocket'],
  auth: {
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTg1ZGIyMTA1MTIxZWM0OTdhYjYyZWUiLCJwaG9uZSI6Iis5NjM5Njg2Nzk1NzIiLCJyb2xlIjoiYWRtaW4iLCJzZXNzaW9uSWQiOiJiYmRhYTg5NC0wZGY2LTQ0YmQtYTc2YS1kOTQzMDU1ZjAzNWQiLCJkZXZpY2VJZCI6InBvc3RtYW4tbG9jYWwtMDAxIiwidHYiOjAsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NzAzOTUwNDksImV4cCI6MTc3MDM5NTk0OX0.R-juRwY2RPCmKN9hirci1rfzuDD8VDvp8JmK55vGL7c',
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
