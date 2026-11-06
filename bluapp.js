import { getIdentity } from './lib/crypto.js';
import { createEnvelope } from './lib/protocol.js';
import { useStore } from './lib/store.js';
import { initMesh } from './lib/mesh.js';

// ==========================================
// 0. DEBUG CONSOLE
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
  document.getElementById('console-output').innerHTML = '<div class="text-emerald-500">> Logs cleared.</div>';
};

// ==========================================
// 1. BOOTSTRAP & MESH SETUP
// ==========================================
const identity = getIdentity();
document.getElementById('my-id-badge').innerText = identity.shortId;

const settingsPubKey = document.getElementById('settings-pubkey');
if(settingsPubKey) settingsPubKey.innerText = identity.pubKey;

const currentRoom = new URLSearchParams(window.location.search).get('room') || 'global-mesh';
document.getElementById('room-name-display').innerText = currentRoom;

// Initialize the PeerJS Mesh
const mesh = initMesh(currentRoom, 
  (env) => {
    if (env.type === 'chat') {
      console.log(`New chat from ${env.from.substring(0,5)}: ${env.payload.text}`);
      useStore.getState().addMessage({ 
        id: env.id, 
        sender: env.from.substring(0,5), 
        text: env.payload.text, 
        isSelf: false 
      });
      renderUI();
    }
    if (env.type === 'vote' && window.updateVotesUI) {
      useStore.getState().addVote(env.payload.category, env.payload.value);
      window.updateVotesUI();
    }
  },
  (pid) => {
    console.log(`Peer connected: ${pid.substring(0,9)}`);
    const p = useStore.getState().peers; 
    p.add(pid); 
    useStore.getState().setPeers(p); 
    renderUI();
  },
  (pid) => {
    console.log(`Peer disconnected: ${pid.substring(0,9)}`);
    const p = useStore.getState().peers; 
    p.delete(pid); 
    useStore.getState().setPeers(p); 
    renderUI();
  }
);

// Make variables globally accessible for commuter.js and creator.js
window.AppMesh = mesh;
window.AppIdentity = identity;
window.AppRoom = currentRoom;

// ==========================================
// 2. UI ROUTING & HELPERS
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

window.copyIdentity = function() {
  navigator.clipboard.writeText(identity.pubKey);
  alert("Your Public Key copied!");
};

// ==========================================
// 3. RENDER LOGIC (Chat & Radar)
// ==========================================
function renderUI() {
  const state = useStore.getState();
  
  const peerCountEl = document.getElementById('peer-count');
  if(peerCountEl) peerCountEl.innerText = `${state.peers.size} Peers`;
  
  const chatBox = document.getElementById('chat-messages-box');
  if(chatBox) {
    chatBox.innerHTML = `<div class="text-center text-[10px] text-slate-400 bg-slate-50 rounded-full py-1.5 px-4 inline-block mx-auto w-max block border border-slate-100 mb-3">Messages are signed and verified locally.</div>`;
    
    state.messages.forEach(msg => {
      const div = document.createElement('div');
      div.className = msg.isSelf ? "flex items-end gap-2 max-w-[80%] ml-auto justify-end mb-3" : "flex items-end gap-2 max-w-[80%] mb-3";
      
      const safeText = msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      
      div.innerHTML = msg.isSelf 
        ? `<div class="bg-brand-600 p-2.5 rounded-2xl rounded-br-none text-xs text-white shadow-sm break-words">${safeText}</div>`
        : `<div class="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[9px] font-bold shrink-0">${msg.sender.charAt(0).toUpperCase()}</div>
           <div class="bg-slate-100 p-2.5 rounded-2xl rounded-bl-none text-xs text-slate-700 shadow-sm break-words">${safeText}</div>`;
      chatBox.appendChild(div);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  document.querySelectorAll('.radar-dot').forEach(el => el.remove());
  const radar = document.getElementById('radar-container');
  
  if(radar) {
    state.peers.forEach((pid) => {
      const dot = document.createElement('div');
      dot.className = "radar-dot absolute z-20 flex items-center justify-center transition-all duration-1000";
      const topPos = 20 + (pid.charCodeAt(0) % 60);
      const leftPos = 20 + (pid.charCodeAt(1) % 60);
      dot.style.top = `${topPos}%`;
      dot.style.left = `${leftPos}%`;
      
      dot.innerHTML = `
        <div class="relative flex h-6 w-6 items-center justify-center">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <div class="relative inline-flex rounded-full h-5 w-5 bg-emerald-500 border-2 border-white shadow-sm items-center justify-center text-[8px] text-white font-bold" title="Peer ${pid.substring(0,9)}">
            <i class="fa-solid fa-user"></i>
          </div>
        </div>
      `;
      radar.appendChild(dot);
    });
  }
}

// Send Message
const sendBtn = document.getElementById('send-btn');
const chatInput = document.getElementById('chat-input');

if (sendBtn && chatInput) {
  const sendMessage = () => {
    const text = chatInput.value.trim();
    if (!text) return;
    
    console.log("Sending message: " + text);
    const env = createEnvelope('chat', currentRoom, identity.pubKey, identity.privKey, { text });
    
    if(env) {
      useStore.getState().addMessage({ id: env.id, sender: identity.shortId, text, isSelf: true });
      mesh.seenMessageIds.add(env.id);
      mesh.sendRaw(env);
      chatInput.value = '';
      renderUI();
    } else {
      console.error("Failed to create envelope.");
    }
  };

  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') sendMessage(); 
  });
}

renderUI();
console.log("faBludar initialized successfully."); 