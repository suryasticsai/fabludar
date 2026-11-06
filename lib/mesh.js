import webconnect from 'https://cdn.jsdelivr.net/npm/webconnect/dist/esm/webconnect.js';
import { validateEnvelope } from './protocol.js';

export function initMesh(roomId, onMessage, onPeerJoin, onPeerLeave) {
  console.log("Connecting via WebConnect Mesh to room: " + roomId);
  
  const connect = webconnect();
  const seenMessageIds = new Set();
  let sendRaw = null;

  // Listen for incoming data
  connect.onReceive((data, attribute) => {
    try {
      const env = JSON.parse(data);
      
      if (seenMessageIds.has(env.id)) return;
      seenMessageIds.add(env.id);
      
      if (!validateEnvelope(env)) {
        console.warn(`Dropped forged message from ${attribute.connectId}`);
        return;
      }

      onMessage(env);
      
      // Relay to other peers (decrement TTL)
      if (env.ttl > 0 && sendRaw) {
        sendRaw(JSON.stringify({ ...env, ttl: env.ttl - 1 }));
      }
    } catch (e) {
      console.warn("Malformed packet dropped", e);
    }
  });

  // Listen for peers joining/leaving
  connect.onConnect((attribute) => {
    onPeerJoin(attribute.connectId);
  });

  connect.onDisconnect((attribute) => {
    onPeerLeave(attribute.connectId);
  });

  // Define the send function
  sendRaw = (data) => {
    connect.Send(data);
  };

  return { 
    sendRaw: (env) => sendRaw(JSON.stringify(env)), 
    seenMessageIds 
  };
}