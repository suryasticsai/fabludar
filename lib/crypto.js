import nacl from 'https://esm.run/tweetnacl@1.0.3';
import util from 'https://esm.run/tweetnacl-util@0.15.1';

export function getIdentity() {
  try {
    let privKeyB64 = localStorage.getItem('fabludar_priv');
    let pubKeyB64 = localStorage.getItem('fabludar_pub');
    if (!privKeyB64 || !pubKeyB64) {
      const keypair = nacl.sign.keyPair();
      privKeyB64 = util.encodeBase64(keypair.secretKey);
      pubKeyB64 = util.encodeBase64(keypair.publicKey);
      localStorage.setItem('fabludar_priv', privKeyB64);
      localStorage.setItem('fabludar_pub', pubKeyB64);
      console.log("Generated new secure Ed25519 identity.");
    }
    return { privKey: privKeyB64, pubKey: pubKeyB64, shortId: pubKeyB64.substring(0, 5) };
  } catch (e) {
    console.error("Crypto failed to load", e);
    return { privKey: null, pubKey: null, shortId: "Error" };
  }
}

export function signPayload(payloadStr, privKeyB64) {
  const sig = nacl.sign.detached(util.decodeUTF8(payloadStr), util.decodeBase64(privKeyB64));
  return util.encodeBase64(sig);
}

export function verifyPayload(payloadStr, sigB64, pubKeyB64) {
  try {
    return nacl.sign.detached.verify(
      util.decodeUTF8(payloadStr),
      util.decodeBase64(sigB64),
      util.decodeBase64(pubKeyB64)
    );
  } catch (e) {
    return false;
  }
}