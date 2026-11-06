import { registerPlugin } from '@capacitor/core';
// You will need to install a native BLE plugin later (e.g., capacitor-mesh-ble)
const MeshBLE = registerPlugin('MeshBLE');

export async function initBLEMesh(roomId, onMessage, onPeerJoin, onPeerLeave) {
  console.log("Starting BLE Mesh for room: " + roomId);
  
  // Start the native Bluetooth radio
  await MeshBLE.start({
    room: roomId,
    serviceUUID: 'f47b5e2d-4a9e-4c5a-9b3f-8e1d2c3a4b5c', // Same as Bitchat for compatibility[reference:3]
  });

  // Listen for incoming data packets
  MeshBLE.addListener('frame', (packet) => {
    try {
      const env = JSON.parse(packet.data);
      onMessage(env);
      // Relay logic: Broadcast to other nearby peers if TTL > 0
      if (env.ttl > 0) {
        MeshBLE.broadcast({ data: JSON.stringify({ ...env, ttl: env.ttl - 1 }) });
      }
    } catch (e) {
      console.warn("Dropped malformed packet", e);
    }
  });

  // Peer discovery events
  MeshBLE.addListener('peer', (peer) => onPeerJoin(peer.id));

  return {
    seenMessageIds: new Set(),
    sendRaw: async (env) => {
      // Convert envelope to string and broadcast over Bluetooth
      await MeshBLE.broadcast({ data: JSON.stringify(env) });
    }
  };
}