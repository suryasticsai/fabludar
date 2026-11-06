import { joinRoom } from 'https://esm.run/trystero@0.21.5';
import { validateEnvelope } from './protocol.js';

export function initMesh(roomId, onMessage, onPeerJoin, onPeerLeave) {
  console.log("Joining room: " + roomId);
  
  const room = joinRoom({ 
    appId: 'fabludar-v2',
    relayUrls: [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.primal.net',
      'wss://relay.snort.social'
    ],
    relayRedundancy: 3
  }, roomId);

  const [sendRaw, getRaw] = room.makeAction('envelope');
  const seenMessageIds = new Set();

  getRaw((env, peerId) => {
    if (seenMessageIds.has(env.id)) return;
    seenMessageIds.add(env.id);
    
    if (!validateEnvelope(env)) {
      console.warn(`Dropped forged message from ${peerId.substring(0,5)}`);
      return;
    }

    onMessage(env);
    
    if (env.ttl > 0) sendRaw({ ...env, ttl: env.ttl - 1 });
  });

  room.onPeerJoin(pid => onPeerJoin(pid));
  room.onPeerLeave(pid => onPeerLeave(pid));

  return { sendRaw, seenMessageIds };
}