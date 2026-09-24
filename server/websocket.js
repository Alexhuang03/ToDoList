const { WebSocketServer } = require('ws');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./models/User');
const File = require('./models/File');

// fileRooms: fileId (string) -> Map of (ws -> user)
const fileRooms = new Map();
let wssInstance = null;

function hasAccess(file, userId) {
  if (!file || !userId) return false;
  const uid = userId.toString();
  const ownerStr = file.ownerId ? (file.ownerId._id ? file.ownerId._id.toString() : file.ownerId.toString()) : '';
  return ownerStr === uid ||
    (Array.isArray(file.sharedWith) && file.sharedWith.some(id => (id._id ? id._id.toString() : id.toString()) === uid));
}

function getActiveUsersInRoom(fileId) {
  const room = fileRooms.get(fileId);
  if (!room) return [];
  const users = [];
  const seenIds = new Set();
  for (const user of room.values()) {
    if (user && !seenIds.has(user.id)) {
      seenIds.add(user.id);
      users.push(user);
    }
  }
  return users;
}

function broadcastPresence(fileId) {
  const activeUsers = getActiveUsersInRoom(fileId);
  broadcastToFile(fileId, {
    type: 'presence_update',
    fileId,
    activeUsers,
  });
}

function broadcastToFile(fileId, data, excludeWs = null) {
  if (!fileId) return;
  const room = fileRooms.get(fileId.toString());
  if (!room || room.size === 0) return;

  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  for (const client of room.keys()) {
    if (client !== excludeWs && client.readyState === 1 /* WebSocket.OPEN */) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('Erreur envoi WebSocket:', err);
      }
    }
  }
}

function leaveFileRoom(ws) {
  if (ws.currentFileId && fileRooms.has(ws.currentFileId)) {
    const room = fileRooms.get(ws.currentFileId);
    room.delete(ws);
    if (room.size === 0) {
      fileRooms.delete(ws.currentFileId);
    } else {
      broadcastPresence(ws.currentFileId);
    }
    ws.currentFileId = null;
  }
}

function initWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wssInstance = wss;

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // Authentification via cookie ou token de requête
    const authPromise = (async () => {
      try {
        const parsedCookies = cookie.parse(req.headers.cookie || '');
        let token = parsedCookies.token;
        if (!token && req.url.includes('token=')) {
          const urlObj = new URL(req.url, 'http://localhost');
          token = urlObj.searchParams.get('token');
        }

        if (!token) {
          ws.close(4001, 'Unauthorized');
          return null;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('name email');
        if (!user) {
          ws.close(4001, 'User not found');
          return null;
        }

        ws.user = {
          id: user._id.toString(),
          name: user.name || user.email.split('@')[0],
          email: user.email,
        };

        // Confirmer la connexion au client
        ws.send(JSON.stringify({
          type: 'connected',
          user: ws.user,
        }));
        return ws.user;
      } catch (err) {
        console.warn('Échec auth WebSocket:', err.message);
        ws.close(4001, 'Authentication failed');
        return null;
      }
    })();

    ws.on('message', async (rawMsg) => {
      try {
        const user = await authPromise;
        if (!user || !ws.user) return;

        const msg = JSON.parse(rawMsg.toString());

        if (msg.type === 'join_file') {
          const fileId = msg.fileId;
          if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) return;

          // Vérifier l'accès au fichier
          const file = await File.findById(fileId).select('ownerId sharedWith');
          if (!file || !hasAccess(file, ws.user.id)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Accès refusé à ce fichier' }));
            return;
          }

          // Quitter l'ancienne salle si nécessaire
          if (ws.currentFileId && ws.currentFileId !== fileId) {
            leaveFileRoom(ws);
          }

          // Rejoindre la nouvelle salle
          if (!fileRooms.has(fileId)) {
            fileRooms.set(fileId, new Map());
          }
          fileRooms.get(fileId).set(ws, ws.user);
          ws.currentFileId = fileId;

          // Notifier tout le monde dans la salle de la nouvelle présence
          broadcastPresence(fileId);
        } else if (msg.type === 'leave_file') {
          leaveFileRoom(ws);
        } else if (msg.type === 'typing') {
          // Relayer l'indication de saisie en direct aux autres membres
          const fileId = ws.currentFileId;
          if (fileId) {
            broadcastToFile(fileId, {
              type: 'user_typing',
              fileId,
              user: ws.user,
              action: msg.action || 'typing', // 'quick_entry' ou 'editing'
              text: msg.text || '',
            }, ws);
          }
        }
      } catch (e) {
        console.error('Erreur traitement message WebSocket:', e);
      }
    });

    ws.on('close', () => {
      leaveFileRoom(ws);
    });

    ws.on('error', (err) => {
      console.error('Erreur client WebSocket:', err);
      leaveFileRoom(ws);
    });
  });

  // Heartbeat ping toutes les 30s pour déconnecter les sockets fantômes
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        leaveFileRoom(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  console.log('⚡ Serveur WebSocket prêt sur /ws');
  return wss;
}

module.exports = {
  initWebSocket,
  broadcastToFile,
};
