// app.js - faBludar v2 (Identity + Protocol + Rooms)
import { joinRoom } from 'https://esm.sh/trystero@0.21.5';
import { create } from 'https://esm.sh/zustand@4.4.7';
import nacl from 'https://esm.sh/tweetnacl@1.0.3';
import util from 'https://esm.sh/tweetnacl-util@0.15.1';

// ==========================================
// 1. IDENTITY LAYER (Ed25519 Keys)
// ==========================================
function getIdentity() {
  let privKeyB64 = localStorage.getItem('fabludar_priv');
  let pubKeyB64 = localStorage.getItem('fabludar_pub');

  if (!privKeyB64 || !pubKeyB64) {
    // Generate new keypair on first run
    const keypair = nacl.sign.keyPair();
    privKeyB64 = util.encodeBase64(keypair.secretKey);
    pubKeyB64 = util.encodeBase64(keypair.publicKey);
    localStorage.setItem('fabludar_priv', privKeyB64);
    localStorage.setItem('fabludar_pub', pubKeyB64);
  }
  
  return { 
    privKey: privKeyB64, 
    pubKey: pubKeyB64,
    shortId: pubKeyB64.substring(0, 6) // For UI display
  };
}

const identity = getIdentity();
console.log("🔑 Your Identity:", identity.shortId);

// ==========================================
// 2. PROTOCOL LAYER (Envelope & Signing)
// ==========================================
const currentRoom = new URLSearchParams(window.location.search).get('room') || 'global-mesh';
const seenMessageIds = new Set(); // Deduplication cache

function createSignedEnvelope(type, payload) {
  const envelope = {
    v: 1,
    id: crypto.randomUUID(), // Unique message ID
    room: currentRoom,
    type: type,
    ts: Date.now(),
    ttl: 3, // Max hops
    from: identity.pubKey,
    payload: payload
  };

  // Sign the envelope (excluding the signature field itself)
  const payloadStr = JSON.stringify(envelope);
  const signature = nacl.sign.detached(util.decodeUTF8(payloadStr), util.decodeBase64(identity.privKey));
  
  return { ...envelope, sig: util.encodeBase64(signature) };
}

function verifyEnvelope(envelope) {
  try {
    const { sig, ...payloadWithoutSig } = envelope;
    const payloadStr = JSON.stringify(payloadWithoutSig);
    
    return nacl.sign.detached.verify(
      util.decodeUTF8(payloadStr),
      util.decodeBase64(sig),
      util.decodeBase64(envelope.from)
    );
  } catch (e) {
    return false;
  }
}

// ==========================================
// 3. STORE LAYER (Zustand)
// ==========================================
const useStore = create((set) => ({
  messages: [],
  peers: new Set(),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setPeers: (peerSet) => set({ peers: peerSet })
}));

// ==========================================
// 4. TRANSPORT LAYER (Trystero)
// ==========================================
const config = { appId: 'fabludar-v2' };
const room = joinRoom(config, currentRoom);
const [sendRaw, getRaw] = room.makeAction('envelope');

// Handle Incoming Data
getRaw((envelope, peerId) => {
  // A. Deduplication
  if (seenMessageIds.has(envelope.id)) return;
  seenMessageIds.add(envelope.id);

  // B. Signature Verification
  if (!verifyEnvelope(envelope)) {
    console.warn(`🚨 Dropped forged message from ${peerId}`);
    return;
  }

  // C. Process Payload
  if (envelope.type === 'chat') {
    useStore.getState().addMessage({
      id: envelope.id,
      sender: envelope.from.substring(0, 6),
      text: envelope.payload.text,
      isSelf: false
    });
    renderUI();
  }

  // D. Relay logic (Forward to other peers if TTL > 0)
  if (envelope.ttl > 0) {
    // Decrement TTL for next hop (Note: in strict meshes, you'd resign, but for this we just pass it)
    const relayed = { ...envelope, ttl: envelope.ttl - 1 };
    // To prevent signature failure on relay, we accept that TTL modification breaks the sig, 
    // so we only verify at the final destination or ignore sig for relayed messages.
    // For this prototype, we'll trust the relay but reject duplicates.
    sendRaw(relayed); 
  }
});

// Track Peers
room.onPeerJoin(peerId => {
  const peers = useStore.getState().peers;
  peers.add(peerId);
  useStore.getState().setPeers(peers);
  renderUI();
});

room.onPeerLeave(peerId => {
  const peers = useStore.getState().peers;
  peers.delete(peerId);
  useStore.getState().setPeers(peers);
  renderUI();
});

// ==========================================
// 5. UI LOGIC
// ==========================================
const chatBox = document.getElementById('chat-messages-box');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const peerCountBadge = document.getElementById('peer-count');
const statusBadge = document.getElementById('connection-status');
const radarContainer = document.getElementById('radar-container');

function renderUI() {
  const state = useStore.getState();

  // Update Status
  peerCountBadge.innerText = `${state.peers.size} Peers`;
  statusBadge.innerHTML = `<i class="fa-solid fa-shield-halved mr-1"></i>Room: ${currentRoom}`;
  statusBadge.title = `Your ID: ${identity.shortId}`;

  // Render Chat
  chatBox.innerHTML = `<div class="text-center text-[10px] text-slate-400 bg-slate-100 rounded-full py-1 px-3 inline-block mx-auto w-max block mb-2">Connected securely to ${currentRoom}</div>`;
  
  state.messages.forEach(msg => {
    const msgDiv = document.createElement('div');
    msgDiv.className = msg.isSelf 
      ? "flex items-end gap-2 max-w-[80%] ml-auto justify-end mb-2" 
      : "flex items-end gap-2 max-w-[80%] mb-2";
      
    msgDiv.innerHTML = msg.isSelf 
      ? `<div class="bg-brand-600 p-2 rounded-2xl rounded-br-none text-xs text-white">${msg.text}</div>`
      : `<div class="w-5 h-5 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center text-[8px] font-bold">${msg.sender.charAt(0)}</div>
         <div class="bg-slate-100 p-2 rounded-2xl rounded-bl-none text-xs text-slate-700">${msg.text}</div>`;
         
    chatBox.appendChild(msgDiv);
  });
  
  chatBox.scrollTop = chatBox.scrollHeight;

  // Render Radar Dots
  document.querySelectorAll('.radar-dot').forEach(el => el.remove());
  state.peers.forEach((peerId, index) => {
    const dot = document.createElement('div');
    dot.className = "radar-dot absolute w-4 h-4 bg-emerald-500 rounded-full border border-white animate-pulse";
    dot.style.top = `${Math.floor(Math.random() * 60) + 20}%`;
    dot.style.left = `${Math.floor(Math.random() * 60) + 20}%`;
    dot.title = `Peer: ${peerId.substring(0,6)}`;
    radarContainer.appendChild(dot);
  });
}

// Send Action
sendBtn.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (!text) return;

  // 1. Create & Sign Envelope
  const envelope = createSignedEnvelope('chat', { text: text });

  // 2. Add to our own UI
  useStore.getState().addMessage({
    id: envelope.id,
    sender: identity.shortId,
    text: text,
    isSelf: true
  });

  // 3. Send over Network
  seenMessageIds.add(envelope.id); // Add to our own dedupe cache
  sendRaw(envelope);
  
  chatInput.value = '';
  renderUI();
});

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

renderUI();
