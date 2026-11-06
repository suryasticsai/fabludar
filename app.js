// ==========================================
// 0. DEBUG CONSOLE ENGINE
// ==========================================
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
let logHistory = ["> Console initialized. Waiting for network events..."];

function appendToConsole(type, args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
  let color = type === 'error' ? 'text-rose-400' : type === 'warn' ? 'text-amber-400' : 'text-emerald-400';
  const formattedLog = `<span class="text-slate-500">[${time}]</span> <span class="${color}">${msg}</span>`;
  logHistory.push(formattedLog);
  
  const outputEl = document.getElementById('console-output');
  if (outputEl) {
    outputEl.innerHTML += `<div class="mb-1">${formattedLog}</div>`;
    outputEl.scrollTop = outputEl.scrollHeight;
  }
}

console.log = (...args) => { originalLog(...args); appendToConsole('info', args); };
console.warn = (...args) => { originalWarn(...args); appendToConsole('warn', args); };
console.error = (...args) => { originalError(...args); appendToConsole('error', args); };

window.copyLogs = function() {
  const rawText = logHistory.map(log => log.replace(/<[^>]*>?/gm, '')).join('\n');
  navigator.clipboard.writeText(rawText).then(() => alert("Logs copied to clipboard!"));
};
window.clearLogs = function() {
  logHistory = [];
  const outputEl = document.getElementById('console-output');
  if (outputEl) outputEl.innerHTML = '<div class="text-emerald-500">> Logs cleared.</div>';
};

// ==========================================
// IMPORTS
// ==========================================
import { joinRoom } from 'https://esm.run/trystero@0.21.5';
import { create } from 'https://esm.run/zustand@4.4.7';
import nacl from 'https://esm.run/tweetnacl@1.0.3';
import util from 'https://esm.run/tweetnacl-util@0.15.1';

// ==========================================
// 1. IDENTITY
// ==========================================
function getIdentity() {
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
const identity = getIdentity();
document.getElementById('my-id-badge').innerText = identity.shortId;

window.copyIdentity = function() {
  if(!identity.pubKey) return;
  navigator.clipboard.writeText(identity.pubKey);
  alert("Your secure Public Key copied!");
};

// ==========================================
// 2. PROTOCOL & MESH
// ==========================================
const currentRoom = new URLSearchParams(window.location.search).get('room') || 'global-mesh';
document.getElementById('room-name-display').innerText = currentRoom;
const seenMessageIds = new Set();

function createSignedEnvelope(type, payload) {
  if(!identity.privKey) return null;
  const env = { v: 1, id: crypto.randomUUID(), room: currentRoom, type, ts: Date.now(), ttl: 3, from: identity.pubKey, payload };
  const sig = nacl.sign.detached(util.decodeUTF8(JSON.stringify(env)), util.decodeBase64(identity.privKey));
  return { ...env, sig: util.encodeBase64(sig) };
}

function verifyEnvelope(env) {
  try {
    const { sig, ...rest } = env;
    return nacl.sign.detached.verify(util.decodeUTF8(JSON.stringify(rest)), util.decodeBase64(sig), util.decodeBase64(env.from));
  } catch (e) { return false; }
}

const useStore = create((set) => ({
  messages: [], peers: new Set(), votes: { eta: [], fullness: [] },
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setPeers: (pSet) => set({ peers: pSet }),
  addVote: (type, val) => set((s) => ({ votes: { ...s.votes, [type]: [...s.votes[type], val] } }))
}));

console.log("Joining room: " + currentRoom);
const room = joinRoom({ appId: 'fabludar-v2' }, currentRoom);
const [sendRaw, getRaw] = room.makeAction('envelope');

getRaw((env, peerId) => {
  if (seenMessageIds.has(env.id)) return;
  seenMessageIds.add(env.id);
  if (!verifyEnvelope(env)) return;

  if (env.type === 'chat') {
    useStore.getState().addMessage({ id: env.id, sender: env.from.substring(0,5), text: env.payload.text, isSelf: false });
    renderUI();
  }
  if (env.type === 'vote') {
    useStore.getState().addVote(env.payload.category, env.payload.value);
    updateVotesUI();
  }
  if (env.ttl > 0) sendRaw({ ...env, ttl: env.ttl - 1 });
});

room.onPeerJoin(pid => { 
  console.log(`Peer joined: ${pid.substring(0,5)}`);
  const p = useStore.getState().peers; 
  p.add(pid); 
  useStore.getState().setPeers(p); 
  renderUI(); 
});

room.onPeerLeave(pid => { 
  const p = useStore.getState().peers; 
  p.delete(pid); 
  useStore.getState().setPeers(p); 
  renderUI(); 
});

// ==========================================
// 3. UI LOGIC
// ==========================================
window.switchPage = function(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${pageName}`);
  if(target) target.classList.add('active');
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('text-brand-600');
    btn.classList.add('text-slate-400');
  });
  
  const activeNav = document.getElementById(`nav-${pageName}`);
  if (activeNav) {
    activeNav.classList.remove('text-slate-400');
    activeNav.classList.add('text-brand-600');
  }
};

function renderUI() {
  const state = useStore.getState();
  document.getElementById('peer-count').innerText = `${state.peers.size} Peers`;
  
  // Render Chat
  const chatBox = document.getElementById('chat-messages-box');
  chatBox.innerHTML = `<div class="text-center text-[10px] text-slate-400 bg-slate-50 rounded-full py-1.5 px-4 inline-block mx-auto w-max block border border-slate-100">Messages are signed and verified locally.</div>`;
  
  state.messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = msg.isSelf ? "flex items-end gap-2 max-w-[80%] ml-auto justify-end" : "flex items-end gap-2 max-w-[80%]";
    div.innerHTML = msg.isSelf 
      ? `<div class="bg-brand-600 p-2.5 rounded-2xl rounded-br-none text-xs text-white shadow-sm">${msg.text}</div>`
      : `<div class="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[9px] font-bold">${msg.sender.charAt(0).toUpperCase()}</div>
         <div class="bg-slate-100 p-2.5 rounded-2xl rounded-bl-none text-xs text-slate-700 shadow-sm">${msg.text}</div>`;
    chatBox.appendChild(div);
  });
  chatBox.scrollTop = chatBox.scrollHeight;

  // Render Radar User Icons
  document.querySelectorAll('.radar-dot').forEach(el => el.remove());
  const radar = document.getElementById('radar-container');
  
  state.peers.forEach((pid, index) => {
    const dot = document.createElement('div');
    dot.className = "radar-dot absolute z-20 flex items-center justify-center transition-all duration-1000";
    dot.style.top = `${Math.floor(Math.random() * 60) + 20}%`;
    dot.style.left = `${Math.floor(Math.random() * 60) + 20}%`;
    
    dot.innerHTML = `
      <div class="relative flex h-6 w-6 items-center justify-center">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <div class="relative inline-flex rounded-full h-5 w-5 bg-emerald-500 border-2 border-white shadow-sm items-center justify-center text-[8px] text-white font-bold" title="${pid}">
          <i class="fa-solid fa-user"></i>
        </div>
      </div>
    `;
    radar.appendChild(dot);
  });
}

document.getElementById('send-btn').addEventListener('click', () => {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  const env = createSignedEnvelope('chat', { text });
  if(env) {
    useStore.getState().addMessage({ id: env.id, sender: identity.shortId, text, isSelf: true });
    seenMessageIds.add(env.id);
    sendRaw(env);
    input.value = '';
    renderUI();
  }
});

document.getElementById('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('send-btn').click(); });

// ==========================================
// 4. COMMUTE PAGE LOGIC
// ==========================================
window.castVote = function(category, value) {
  const env = createSignedEnvelope('vote', { category, value });
  if(env) {
    seenMessageIds.add(env.id);
    sendRaw(env);
    useStore.getState().addVote(category, value);
    updateVotesUI();
    alert(`Vote cast: ${value}`);
  }
};

function updateVotesUI() {
  const votes = useStore.getState().votes.eta;
  if (votes.length > 0) {
    const sorted = [...votes].sort((a,b) => a-b);
    const median = sorted[Math.floor(sorted.length / 2)];
    document.getElementById('eta-display').innerText = median;
  }
}

// Render Seat Map
const seatGrid = document.getElementById('seat-grid');
if(seatGrid) {
  for (let i = 1; i <= 12; i++) {
    const seat = document.createElement('div');
    seat.className = "w-8 h-8 rounded-lg bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center cursor-pointer shadow-sm transition-all active:scale-90";
    seat.innerText = i;
    seat.onclick = () => {
      if (seat.classList.contains('bg-brand-500')) {
        seat.classList.replace('bg-brand-500', 'bg-slate-300');
        seat.classList.replace('text-white', 'text-slate-500');
      } else {
        seat.classList.replace('bg-slate-300', 'bg-brand-500');
        seat.classList.replace('text-slate-500', 'text-white');
      }
    };
    seatGrid.appendChild(seat);
  }
}

// ==========================================
// 5. QR CODE MODAL
// ==========================================
window.showQRCode = function() {
  const modal = document.getElementById('qr-modal');
  if(!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  const qrContainer = document.getElementById('qrcode-container');
  qrContainer.innerHTML = ''; 
  const roomLink = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
  new QRCode(qrContainer, {
    text: roomLink, width: 180, height: 180, colorDark : "#1e293b", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.H
  });
};

window.closeQRCode = function() {
  const modal = document.getElementById('qr-modal');
  if(modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

window.copyRoomLink = function() {
  const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
  navigator.clipboard.writeText(link);
  alert("Link copied to clipboard!");
};

// Render initial state
renderUI();
console.log("faBludar initialized successfully.");