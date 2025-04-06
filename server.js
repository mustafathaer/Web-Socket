const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Add this middleware to handle root requests
app.get('/', (req, res) => {
  res.status(200).send(`
    <h1>WebSocket Bridge Server</h1>
    <p>Status: Running</p>
    <p>WebSocket endpoint: <code>ws://${req.headers.host}</code></p>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', wsClients: wss.clients.size });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);
});

// WebSocket Server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  ws.on('message', (message) => {
    console.log(`Received: ${message}`);
    // Broadcast to all clients except sender
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});