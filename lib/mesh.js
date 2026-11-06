import Peer from 'https://esm.run/peerjs@1.5.0';
import { validateEnvelope } from './protocol.js';

export function initMesh(roomId, onMessage, onPeerJoin, onPeerLeave) {
  console.log("Connecting via PeerJS Mesh to room: " + roomId);
  
  const myId = `fabludar-node-${Math.random().toString(36).substring(2, 9)}`;
  const roomHostId = `fabludar-room-${roomId}`;
  
  let peer = new Peer(myId);
  const connections = new Map();
  const seenMessageIds = new Set();
  let isHost = false;

  // Send to all connected peers
  const broadcast = (env, excludeId = null) => {
    const packet = { type: 'envelope', envelope: env };
    connections.forEach((conn, pid) => {
      if (pid !== excludeId && conn.open) {
        conn.send(packet);
      }
    });
  };

  // Handle a connection
  const setupConn = (conn) => {
    conn.on('open', () => {
      console.log("Connected to peer:", conn.peer);
      connections.set(conn.peer, conn);
      onPeerJoin(conn.peer);
    });

    conn.on('data', (data) => {
      // 1. Handle Chat/Vote Messages
      if (data.type === 'envelope') {
        const env = data.envelope;
        if (seenMessageIds.has(env.id)) return;
        seenMessageIds.add(env.id);
        
        if (validateEnvelope(env)) {
          onMessage(env);
          if (env.ttl > 0) {
             broadcast({ ...env, ttl: env.ttl - 1 }, conn.peer);
          }
        }
      } 
      // 2. Handle Peer Discovery (Host tells everyone about everyone)
      else if (data.type === 'peer-discovery') {
         if (data.peerId !== myId && !connections.has(data.peerId)) {
             const newConn = peer.connect(data.peerId);
             setupConn(newConn);
         }
      } 
      // 3. Handle Host Registration
      else if (data.type === 'register' && isHost) {
          const newConn = peer.connect(data.peerId);
          setupConn(newConn);
          // Tell the new peer about existing peers
          connections.forEach((c, pid) => {
             if (c.open) c.send({ type: 'peer-discovery', peerId: pid });
          });
          // Tell existing peers about the new peer
          broadcast({ type: 'peer-discovery', peerId: data.peerId }, conn.peer);
      }
    });

    conn.on('close', () => {
      console.log("Disconnected:", conn.peer);
      connections.delete(conn.peer);
      onPeerLeave(conn.peer);
    });
  };

  peer.on('open', (id) => {
    console.log("My PeerJS ID:", id);
    
    // Attempt to connect to the room host
    const hostConn = peer.connect(roomHostId);
    setupConn(hostConn);
    
    // Once connected, register with the host
    hostConn.on('open', () => {
        hostConn.send({ type: 'register', peerId: myId });
    });
  });

  // Listen for incoming connections
  peer.on('connection', (conn) => {
    setupConn(conn);
  });

  // Error handling: If no host exists, we become the host!
  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable' && !isHost) {
      console.log("Room host not found. I am the host now!");
      isHost = true;
      peer.destroy();
      
      // Claim the room host ID
      peer = new Peer(roomHostId);
      peer.on('open', (id) => {
         console.log("Hosting room as:", id);
      });
      peer.on('connection', (conn) => {
         setupConn(conn);
      });
    } else {
      console.warn("PeerJS warning:", err);
    }
  });

  return { 
    sendRaw: (env) => broadcast(env),
    seenMessageIds 
  };
} 