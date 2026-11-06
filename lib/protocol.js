import { verifyPayload, signPayload } from './crypto.js';

export function createEnvelope(type, room, from, privKey, payload) {
  if(!privKey) return null;
  const env = { v: 1, id: crypto.randomUUID(), room, type, ts: Date.now(), ttl: 3, from, payload };
  env.sig = signPayload(JSON.stringify(env), privKey);
  return env;
}

export function validateEnvelope(env) {
  if (!env || env.v !== 1 || !env.sig) return false;
  const { sig, ...rest } = env;
  return verifyPayload(JSON.stringify(rest), sig, env.from);
}