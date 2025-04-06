const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// 1. HTTPS Redirection (Railway enforces HTTPS)
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// 2. Root endpoint
app.get('/', (req, res) => {
  res.send(`
    <h1>WebSocket Bridge Server</h1>
    <p>Status: Running</p>
    <p>WebSocket endpoint: <code>wss://${req.headers.host}</code></p>  <!-- Changed ws:// to wss:// -->
  `);
});

// 3. Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    wsClients: Array.from(wss.clients).filter(c => c.readyState === WebSocket.OPEN).length 
  });
});

// 4. Server setup
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP/WebSocket server running on port ${PORT}`);
});

// 5. WebSocket server
const wss = new WebSocket.Server({ 
  server,
  // 6. Verify client connections (optional but recommended)
  verifyClient: (info, callback) => {
    const isValid = /* Add your validation logic */ true;
    callback(isValid);
  }
});

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // 7. Send immediate acknowledgment
  ws.send(JSON.stringify({ type: 'connection_ack', status: 'connected' }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message); // Assuming JSON messages
      console.log('Received:', data);
      
      // 8. Broadcast with error handling
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data), (err) => {
            if (err) console.error('Send error:', err);
          });
        }
      });
    } catch (err) {
      console.error('Message parse error:', err);
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// 9. Handle server shutdown gracefully
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  wss.clients.forEach(client => client.close());
  server.close(() => process.exit(0));
});