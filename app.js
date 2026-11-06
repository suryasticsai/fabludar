// app.js
// 100% Browser-native. No build step required.

import { joinRoom } from 'https://esm.sh/trystero@0.21.5';
import { create } from 'https://esm.sh/zustand@4.4.7';

// 1. Generate a random pseudo-anonymous ID for this session
const myPeerId = 'user_' + Math.random().toString(36).substring(2, 8);
const roomId = 'fabludar-global-mesh-v1';

// 2. Setup Global State (Zustand)
const useStore = create((set) => ({
  messages: [],
  peers: new Set(),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setPeers: (peerSet) => set({ peers: peerSet })
}));

// 3. Initialize WebRTC Mesh (Trystero)
// Trystero uses free public BitTorrent trackers to find peers, then connects P2P.
const config = { appId: 'fabludar' };
const room = joinRoom(config, roomId);

// Setup sending/receiving channels
const [sendChat, getChat] = room.makeAction('chat');

// 4. Handle incoming messages
getChat((data, peerId) => {
  console.log(`Message from ${peerId}:`, data.text);
  useStore.getState().addMessage({ 
    id: Date.now(), 
    sender: peerId.substring(0, 5), 
    text: data.text, 
    isSelf: false 
  });
  renderUI();
});

// 5. Handle Peers Joining/Leaving (The Radar)
room.onPeerJoin(peerId => {
  console.log(`${peerId} joined the mesh!`);
  const peers = useStore.getState().peers;
  peers.add(peerId);
  useStore.getState().setPeers(peers);
  renderUI();
});

room.onPeerLeave(peerId => {
  console.log(`${peerId} left the mesh.`);
  const peers = useStore.getState().peers;
  peers.delete(peerId);
  useStore.getState().setPeers(peers);
  renderUI();
});

// 6. UI Logic & DOM Manipulation
const chatBox = document.getElementById('chat-messages-box');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const peerCountBadge = document.getElementById('peer-count');
const statusBadge = document.getElementById('connection-status');
const radarContainer = document.getElementById('radar-container');

// Update UI when state changes
function renderUI() {
  const state = useStore.getState();

  // 1. Update Peer Count
  peerCountBadge.innerText = `${state.peers.size} Peers`;
  statusBadge.innerHTML = `<i class="fa-bluetooth fa-brands mr-1"></i>Mesh Active`;

  // 2. Render Chat Messages
  chatBox.innerHTML = `<div class="text-center text-[10px] text-slate-400 bg-slate-100 rounded-full py-1 px-3 inline-block mx-auto w-max block mb-2">Connected to WebRTC Mesh</div>`;
  
  state.messages.forEach(msg => {
    const msgDiv = document.createElement('div');
    msgDiv.className = msg.isSelf 
      ? "flex items-end gap-2 max-w-[80%] ml-auto justify-end" 
      : "flex items-end gap-2 max-w-[80%]";
      
    msgDiv.innerHTML = msg.isSelf 
      ? `<div class="bg-brand-600 p-2 rounded-2xl rounded-br-none text-xs text-white">${msg.text}</div>`
      : `<div class="w-5 h-5 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center text-[8px] font-bold">${msg.sender.charAt(0).toUpperCase()}</div>
         <div class="bg-slate-100 p-2 rounded-2xl rounded-bl-none text-xs text-slate-700">${msg.text}</div>`;
         
    chatBox.appendChild(msgDiv);
  });
  
  chatBox.scrollTop = chatBox.scrollHeight;

  // 3. Render Radar Dots (Fake positions for visual effect)
  // Remove old dots
  document.querySelectorAll('.radar-dot').forEach(el => el.remove());
  
  state.peers.forEach((peerId, index) => {
    const dot = document.createElement('div');
    dot.className = "radar-dot absolute w-4 h-4 bg-emerald-500 rounded-full border border-white animate-pulse";
    // Random position within the radar circle
    dot.style.top = `${Math.floor(Math.random() * 60) + 20}%`;
    dot.style.left = `${Math.floor(Math.random() * 60) + 20}%`;
    dot.title = peerId;
    radarContainer.appendChild(dot);
  });
}

// Send Message Logic
sendBtn.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (!text) return;

  // 1. Send over P2P network
  sendChat({ text: text });

  // 2. Add to our own UI
  useStore.getState().addMessage({ 
    id: Date.now(), 
    sender: 'You', 
    text: text, 
    isSelf: true 
  });
  
  chatInput.value = '';
  renderUI();
});

// Allow pressing "Enter" to send
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

// Initial Render
renderUI();
