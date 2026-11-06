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

  const broadcast = (data, excludeId = null) => {
    connections.forEach((conn, pid) => {
      if (pid !== excludeId && conn.open) conn.send(data);
    });
  };

  const sendToPeer = (targetId, data) => {
    const conn = connections.get(targetId);
    if (conn && conn.open) {
      conn.send(data);
    } else {
      console.warn("Could not send: Peer not connected", targetId);
    }
  };

  const setupConn = (conn) => {
    conn.on('open', () => {
      console.log("Connected to peer:", conn.peer);
      connections.set(conn.peer, conn);
      onPeerJoin(conn.peer);
    });

    conn.on('data', (data) => {
      if (data.type === 'envelope') {
        const env = data.envelope;
        if (seenMessageIds.has(env.id)) return;
        seenMessageIds.add(env.id);
        
        if (validateEnvelope(env)) {
          onMessage(env);
          if (env.ttl > 0) broadcast({ type: 'envelope', envelope: { ...env, ttl: env.ttl - 1 } }, conn.peer);
        }
      } 
      else if (data.type === 'peer-discovery' && data.peerId !== myId && !connections.has(data.peerId)) {
         const newConn = peer.connect(data.peerId);
         setupConn(newConn);
      } 
      else if (data.type === 'register' && isHost) {
          const newConn = peer.connect(data.peerId);
          setupConn(newConn);
          connections.forEach((c, pid) => {
             if (c.open && pid !== data.peerId) c.send({ type: 'peer-discovery', peerId: data.peerId });
          });
      }
    });

    conn.on('close', () => {
      console.log("Disconnected:", conn.peer);
      connections.delete(conn.peer);
      onPeerLeave(conn.peer);
    });
  };

  peer.on('open', (id) => {
    const hostConn = peer.connect(roomHostId);
    setupConn(hostConn);
    hostConn.on('open', () => hostConn.send({ type: 'register', peerId: myId }));
  });

  peer.on('connection', (conn) => setupConn(conn));

  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable' && !isHost) {
      isHost = true;
      peer.destroy();
      peer = new Peer(roomHostId);
      peer.on('connection', (conn) => setupConn(conn));
    }
  });

  // GPS TRACKING & BROADCASTING
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition((pos) => {
      broadcast({
        type: 'location',
        senderId: myId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      });
    }, (err) => console.warn("GPS Error:", err), { enableHighAccuracy: true });
  }

  return { 
    myId,
    sendRaw: (env) => broadcast({ type: 'envelope', envelope: env }),
    sendToPeer: (targetId, env) => sendToPeer(targetId, { type: 'envelope', envelope: env }),
    seenMessageIds 
  };
}