import { joinRoom } from 'https://esm.run/trystero@0.21.5';
import { validateEnvelope } from './protocol.js';

export function initMesh(roomId, onMessage, onPeerJoin, onPeerLeave) {
  console.log("Connecting to P2P room: " + roomId);
  
  // Trystero uses these trackers to help phones find each other
  const config = { 
    appId: 'fabludar-v2',
    trackerUrls: [
      'wss://tracker.btorrent.xyz',
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.webtorrent.dev'
    ]
  };

  const room = joinRoom(config, roomId);
  const [sendRaw, getRaw] = room.makeAction('envelope');
  const seenMessageIds = new Set();

  // Listen for incoming messages
  getRaw((env, peerId) => {
    if (seenMessageIds.has(env.id)) return;
    seenMessageIds.add(env.id);
    
    if (!validateEnvelope(env)) {
      console.warn(`Dropped forged message from ${peerId.substring(0,5)}`);
      return;
    }

    onMessage(env);
    
    // Relay to other peers (decrement TTL)
    if (env.ttl > 0) sendRaw({ ...env, ttl: env.ttl - 1 });
  });

  room.onPeerJoin(pid => onPeerJoin(pid));
  room.onPeerLeave(pid => onPeerLeave(pid));

  return { sendRaw, seenMessageIds };
}