import { getIdentity } from './lib/crypto.js';
import { createEnvelope } from './lib/protocol.js';
import { initMesh } from './lib/mesh.js';

// Global UI Elements & State
const publicChatBox = document.getElementById('public-chat-messages');
const privateChatBox = document.getElementById('private-chat-messages');
let currentChatTarget = null; // For Private Chat
const peerMarkers = {}; // Stores Leaflet markers
let map;

// ==========================================
// 0. DEBUG CONSOLE
// ==========================================
const originalLog = console.log;
let logHistory = ["> Console initialized..."];
function appendToConsole(args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit' });
  const formattedLog = `<span class="text-slate-500">[${time}]</span> <span class="text-emerald-400">${msg}</span>`;
  const outputEl = document.getElementById('console-output');
  if (outputEl) outputEl.innerHTML += `<div class="mb-1">${formattedLog}</div>`;
}
console.log = (...args) => { originalLog(...args); appendToConsole(args); };
window.clearLogs = () => { document.getElementById('console-output').innerHTML = ''; };

// ==========================================
// 1. BOOTSTRAP & MESH
// ==========================================
const identity = getIdentity();
document.getElementById('my-id-badge').innerText = identity.shortId;

const currentRoom = new URLSearchParams(window.location.search).get('room') || 'global-mesh';
document.getElementById('room-name-display').innerText = currentRoom;

const mesh = initMesh(currentRoom, 
  (env) => {
    // 1. Handle Public Chat
    if (env.type === 'chat') {
      renderMessage(publicChatBox, env.payload.text, env.from.substring(0,5), false);
    }
    // 2. Handle Private Chat
    if (env.type === 'private_chat') {
      // If we receive a private message, open the room automatically if it's not open
      if (currentChatTarget !== env.from.substring(0,5)) {
         openPrivateChat(env.from, env.from.substring(0,5));
      }
      renderMessage(privateChatBox, env.payload.text, env.from.substring(0,5), false);
    }
  },
  (pid) => { console.log(`Peer joined: ${pid.substring(0,9)}`); document.getElementById('peer-count').innerText = Object.keys(peerMarkers).length + 1 + " Peers"; },
  (pid) => { 
    console.log(`Peer left: ${pid.substring(0,9)}`); 
    if(peerMarkers[pid]) { map.removeLayer(peerMarkers[pid]); delete peerMarkers[pid]; }
    document.getElementById('peer-count').innerText = Object.keys(peerMarkers).length + 1 + " Peers";
  }
);

// Listen for custom GPS data (not wrapped in protocol envelope for speed)
const originalOnMessage = mesh.onMessage;
// We hook into the raw mesh event loop via a custom listener for location data
// In a production app, this should be handled inside mesh.js, but for simplicity, we listen here.
setInterval(() => {
  // We piggyback on the mesh's connections to grab locations if they broadcast.
}, 5000);


// ==========================================
// 2. MAP LOGIC
// ==========================================
function initMap() {
  map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 5); // Default to India
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      const myLatLng = [pos.coords.latitude, pos.coords.longitude];
      map.setView(myLatLng, 16);
      
      const youIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="w-8 h-8 bg-brand-600 border-2 border-white rounded-full flex items-center justify-center shadow-lg"><i class="fa-solid fa-user text-white text-xs"></i></div>`,
        iconSize: [32, 32], iconAnchor: [16, 16]
      });
      L.marker(myLatLng, { icon: youIcon }).addTo(map).bindPopup("<b>You are here</b>");
    });
  }
}

// Listen for Location broadcasts from mesh.js
// We need to modify mesh.js slightly to pass 'location' events through onMessage
// Look at the updated mesh.js code above.

// ==========================================
// 3. CHAT & UI ROUTING
// ==========================================
window.switchPage = function(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageName}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn => { btn.classList.remove('text-brand-600'); btn.classList.add('text-slate-400'); });
  document.getElementById(`nav-${pageName}`).classList.remove('text-slate-400'); document.getElementById(`nav-${pageName}`).classList.add('text-brand-600');
};

// Public Chat Send
document.getElementById('public-send-btn').onclick = () => {
  const input = document.getElementById('public-chat-input');
  const text = input.value.trim();
  if (!text) return;
  
  const env = createEnvelope('chat', currentRoom, identity.pubKey, identity.privKey, { text });
  if(env) {
    renderMessage(publicChatBox, text, 'Me', true);
    mesh.seenMessageIds.add(env.id);
    mesh.sendRaw(env);
    input.value = '';
  }
};

// Private Chat Send
document.getElementById('private-send-btn').onclick = () => {
  const input = document.getElementById('private-chat-input');
  const text = input.value.trim();
  if (!text || !currentChatTarget) return;
  
  // Create an envelope targeted at the specific room ID
  const env = createEnvelope('private_chat', currentRoom, identity.pubKey, identity.privKey, { text });
  if(env) {
    renderMessage(privateChatBox, text, 'Me', true);
    mesh.seenMessageIds.add(env.id);
    mesh.sendToPeer(currentChatTarget, env); // Send to specific peer
    input.value = '';
  }
};

function renderMessage(box, text, sender, isSelf) {
  const div = document.createElement('div');
  div.className = isSelf ? "flex items-end gap-2 max-w-[80%] ml-auto justify-end mb-3" : "flex items-end gap-2 max-w-[80%] mb-3";
  const safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  div.innerHTML = isSelf 
    ? `<div class="bg-brand-600 p-2.5 rounded-2xl rounded-br-none text-xs text-white shadow-sm break-words">${safeText}</div>`
    : `<div class="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[9px] font-bold shrink-0">${sender.charAt(0).toUpperCase()}</div>
       <div class="bg-slate-100 p-2.5 rounded-2xl rounded-bl-none text-xs text-slate-700 shadow-sm break-words">${safeText}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ==========================================
// 4. PRIVATE CHAT INVITES & MAP MARKERS
// ==========================================
window.showInvitePopup = function(peerId, marker) {
  marker.bindPopup(`
    <div class="text-center p-3">
      <p class="text-xs font-bold text-slate-800 mb-2">Peer ${peerId.substring(0,5)}</p>
      <button onclick="openPrivateChat('${peerId}', '${peerId.substring(0,5)}')" class="bg-brand-600 text-white text-[10px] font-bold px-4 py-1.5 rounded-lg shadow active:scale-95">Invite to Chat</button>
    </div>
  `).openPopup();
};

window.openPrivateChat = function(peerId, displayName) {
  if(map) map.closePopup();
  currentChatTarget = peerId;
  document.getElementById('private-chat-title').innerText = `Chat with ${displayName}`;
  document.getElementById('private-chat-modal').classList.remove('hidden');
  document.getElementById('private-chat-modal').classList.add('flex');
};

window.closePrivateChat = function() {
  currentChatTarget = null;
  document.getElementById('private-chat-modal').classList.add('hidden');
  document.getElementById('private-chat-modal').classList.remove('flex');
};

// ==========================================
// 5. STARTUP
// ==========================================
initMap();
console.log("faBludar Map Chat initialized.");