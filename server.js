const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// HTTP to HTTPS redirect in production
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Basic routes
app.get('/', (req, res) => {
  res.send(`
    <h1>ESP32 WebSocket Bridge</h1>
    <p>Connected devices: ${Object.keys(deviceMap).length}</p>
    <p>WebSocket endpoint: wss://${req.headers.host}</p>
  `);
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

// Device tracking
const deviceMap = {}; // { deviceId: WebSocket }
const deviceLastSeen = {}; // { deviceId: timestamp }

// Heartbeat interval to clean up dead connections
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
setInterval(() => {
  const now = Date.now();
  Object.entries(deviceLastSeen).forEach(([deviceId, lastSeen]) => {
    if (now - lastSeen > HEARTBEAT_INTERVAL * 2) {
      console.log(`Device ${deviceId} timed out`);
      if (deviceMap[deviceId]) deviceMap[deviceId].close();
      delete deviceMap[deviceId];
      delete deviceLastSeen[deviceId];
    }
  });
}, HEARTBEAT_INTERVAL);

wss.on('connection', (ws) => {
  let deviceId = null;

  console.log('New client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // 1. Device Registration
      if (data.type === 'register' && data.deviceId) {
        deviceId = data.deviceId;
        deviceMap[deviceId] = ws;
        deviceLastSeen[deviceId] = Date.now();
        
        console.log(`Device registered: ${deviceId}`);
        ws.send(JSON.stringify({ 
          type: 'registration_ack',
          status: 'success',
          deviceId
        }));
        return;
      }

      // 2. Heartbeat
      if (data.type === 'heartbeat' && deviceId) {
        deviceLastSeen[deviceId] = Date.now();
        return;
      }

      // 3. Command Forwarding
      if (data.type === 'command' && data.targetDeviceId) {
        const targetWs = deviceMap[data.targetDeviceId];
        
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
          targetWs.send(JSON.stringify(data));
          console.log(`Command forwarded to ${data.targetDeviceId}`);
        } else {
          console.warn(`Device ${data.targetDeviceId} not connected`);
          ws.send(JSON.stringify({ 
            error: `Device ${data.targetDeviceId} offline`,
            type: 'command_error'
          }));
        }
        return;
      }

    } catch (err) {
      console.error('Message parse error:', err);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${deviceId || 'unregistered'}`);
    if (deviceId) {
      delete deviceMap[deviceId];
      delete deviceLastSeen[deviceId];
    }
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error (${deviceId}):`, err);
  });
});

// Clean shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  wss.clients.forEach(client => client.close());
  server.close(() => process.exit(0));
});