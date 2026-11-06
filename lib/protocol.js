import { verifyPayload } from './crypto.js';

export function createEnvelope(type, room, from, privKey, payload) {
  if(!privKey) return null;
  const env = { 
    v: 1, 
    id: crypto.randomUUID(), 
    room, type, 
    ts: Date.now(), 
    ttl: 3, 
    from, 
    payload 
  };
  
  // We need to import signPayload dynamically or statically here
  import('./crypto.js').then(({ signPayload }) => {
    env.sig = signPayload(JSON.stringify(env), privKey);
  });
  
  // Synchronous fallback for our specific use case
  const { signPayload } = window; // We will attach this in bluapp.js to make it synchronous
  if (signPayload) {
     env.sig = signPayload(JSON.stringify(env), privKey);
     return env;
  }
  return null;
}

export function validateEnvelope(env) {
  if (!env || env.v !== 1 || !env.sig) return false;
  const { sig, ...rest } = env;
  return verifyPayload(JSON.stringify(rest), sig, env.from);
}