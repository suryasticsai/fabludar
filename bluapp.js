import { getIdentity } from './lib/crypto.js';
import { createEnvelope } from './lib/protocol.js';
import { initMesh } from './lib/mesh.js';

// Global State
const identity = getIdentity();
document.getElementById('my-id-badge').innerText = identity.shortId;

const currentRoom = 'global-mesh';
let map;
let myLat = 0, myLng = 0;
let longPressTimer;
let selectedLatLng = null;
let currentChatTarget = null;

// Store for Map Notes: { noteId: { lat, lng, text, votes: {}, marker } }
const mapNotes = {};
const myVotes = {}; // Track what I've voted on

// Initialize Mesh
const mesh = initMesh(currentRoom, 
  (env) => {
    // 1. Chat Messages
    if (env.type === 'chat') {
      if (currentChatTarget === env.from.substring(0,5)) {
        renderMessage(document.getElementById('private-chat-messages'), env.payload.text, env.from.substring(0,5), false);
      }
    }
    // 2. New Map Notes
    if (env.type === 'map_note') {
      addNoteToMap(env.payload, env.id);
    }
    // 3. Note Votes
    if (env.type === 'note_vote') {
      const { noteId, vote } = env.payload;
      if (mapNotes[noteId]) {
        mapNotes[noteId].votes[env.from] = vote;
        updateNotePopup(noteId);
      }
    }
  },
  (pid) => { console.log(`Peer joined: ${pid}`); },
  (pid) => { console.log(`Peer left: ${pid}`); }
);

// ==========================================
// 1. MAP INITIALIZATION & CONTROLS
// ==========================================
function initMap() {
  map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
  
  // ✅ FIXED: Use OpenStreetMap standard tiles (Free, No API Key)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  // Get User Location
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition((pos) => {
      myLat = pos.coords.latitude;
      myLng = pos.coords.longitude;
      
      if (map.getZoom() === 5) {
        map.setView([myLat, myLng], 16); // Initial center
        addSelfMarker();
      }
    });
  }

  // --- LONG PRESS LOGIC ---
  const mapContainer = document.getElementById('map');
  
  const startPress = (e) => {
    // Ignore if clicking on a marker or button
    if (e.target.closest('.leaflet-marker-icon') || e.target.closest('button')) return;
    
    const touch = e.touches ? e.touches[0] : e;
    longPressTimer = setTimeout(() => {
      // Get LatLng from pixel coordinates
      const rect = mapContainer.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      selectedLatLng = map.containerPointToLatLng([x, y]);
      
      openNoteModal(selectedLatLng);
    }, 800); // 800ms hold
  };

  const cancelPress = () => { clearTimeout(longPressTimer); };

  mapContainer.addEventListener('mousedown', startPress);
  mapContainer.addEventListener('touchstart', startPress, { passive: true });
  mapContainer.addEventListener('mouseup', cancelPress);
  mapContainer.addEventListener('touchend', cancelPress);
  mapContainer.addEventListener('touchmove', cancelPress);
  mapContainer.addEventListener('mousemove', cancelPress);
}

function addSelfMarker() {
  const youIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="w-8 h-8 bg-brand-600 border-2 border-white rounded-full flex items-center justify-center shadow-lg"><i class="fa-solid fa-user text-white text-xs"></i></div>`,
    iconSize: [32, 32], iconAnchor: [16, 16]
  });
  L.marker([myLat, myLng], { icon: youIcon }).addTo(map).bindPopup("<b>You are here</b>");
}

window.recenterMap = function() {
  if (myLat && myLng) map.flyTo([myLat, myLng], 16, { animate: true, duration: 1 });
};

// ==========================================
// 2. SEARCH LOCATION (Nominatim)
// ==========================================
window.searchLocation = async function() {
  const query = document.getElementById('map-search-input').value.trim();
  if (!query) return;
  
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
    const data = await res.json();
    
    if (data.length > 0) {
      const { lat, lon, display_name } = data[0];
      map.flyTo([lat, lon], 16, { animate: true, duration: 1 });
      L.popup().setLatLng([lat, lon]).setContent(display_name).openOn(map);
    } else {
      alert("Location not found");
    }
  } catch (e) {
    console.error("Search failed", e);
  }
};

// ==========================================
// 3. MAP NOTES (Add, Render, Vote)
// ==========================================
function openNoteModal(latLng) {
  document.getElementById('note-coords').innerText = `Lat: ${latLng.lat.toFixed(5)}, Lng: ${latLng.lng.toFixed(5)}`;
  document.getElementById('note-input').value = '';
  document.getElementById('note-modal').classList.remove('hidden');
  document.getElementById('note-modal').classList.add('flex');
  // Vibrate to confirm long press
  if (navigator.vibrate) navigator.vibrate(50); 
}

window.submitNote = function() {
  const text = document.getElementById('note-input').value.trim();
  if (!text || !selectedLatLng) return;

  const payload = { lat: selectedLatLng.lat, lng: selectedLatLng.lng, text };
  const env = createEnvelope('map_note', currentRoom, identity.pubKey, identity.privKey, payload);
  
  if (env) {
    // Add locally
    addNoteToMap(payload, env.id);
    // Broadcast
    mesh.sendRaw(env);
    closeNoteModal();
  }
};

function addNoteToMap(note, noteId) {
  if (mapNotes[noteId]) return; // Already exists
  
  const noteIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="w-8 h-8 bg-amber-400 border-2 border-white rounded-full flex items-center justify-center shadow-lg"><i class="fa-solid fa-message text-white text-xs"></i></div>`,
    iconSize: [32, 32], iconAnchor: [16, 16]
  });

  const marker = L.marker([note.lat, note.lng], { icon: noteIcon }).addTo(map);
  
  mapNotes[noteId] = {
    ...note,
    marker,
    votes: {} // peerId -> 1 or -1
  };

  marker.on('click', () => {
    updateNotePopup(noteId);
    mapNotes[noteId].marker.bindPopup(getPopupHtml(noteId)).openPopup();
  });
}

function getPopupHtml(noteId) {
  const note = mapNotes[noteId];
  const score = Object.values(note.votes).reduce((a, b) => a + b, 0);
  
  // If score is too low, mark as hidden
  if (score <= -3) return `<div class="p-3 text-center text-xs text-slate-500">Note hidden by community.</div>`;

  return `
    <div class="p-3 max-w-[200px]">
      <p class="text-xs font-bold text-slate-800 mb-2">${note.text}</p>
      <div class="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
        <button onclick="voteNote('${noteId}', 1)" class="flex items-center gap-1 text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded transition"><i class="fa-solid fa-thumbs-up"></i> <span>${Object.values(note.votes).filter(v=>v===1).length}</span></button>
        <span class="text-[10px] font-bold text-slate-400">Score: ${score}</span>
        <button onclick="voteNote('${noteId}', -1)" class="flex items-center gap-1 text-rose-600 hover:bg-rose-50 px-2 py-1 rounded transition"><i class="fa-solid fa-thumbs-down"></i></button>
      </div>
    </div>
  `;
}

function updateNotePopup(noteId) {
  const note = mapNotes[noteId];
  if (note && note.marker.isPopupOpen()) {
    note.marker.setPopupContent(getPopupHtml(noteId));
  }
}

window.voteNote = function(noteId, voteValue) {
  const note = mapNotes[noteId];
  if (!note) return;

  // Toggle vote
  if (myVotes[noteId] === voteValue) {
    delete note.votes[identity.pubKey];
    delete myVotes[noteId];
  } else {
    note.votes[identity.pubKey] = voteValue;
    myVotes[noteId] = voteValue;
  }

  // Update UI locally
  updateNotePopup(noteId);

  // Broadcast Vote
  const payload = { noteId, vote: voteValue };
  const env = createEnvelope('note_vote', currentRoom, identity.pubKey, identity.privKey, payload);
  if (env) mesh.sendRaw(env);
};

// ==========================================
// 4. PRIVATE CHAT
// ==========================================
window.openPrivateChat = function(peerId, displayName) {
  if(map) map.closePopup();
  currentChatTarget = peerId;
  document.getElementById('private-chat-title').innerText = `Chat with ${displayName}`;
  document.getElementById('private-chat-modal').classList.remove('hidden');
  document.getElementById('private-chat-modal').classList.add('flex');
};

document.getElementById('private-send-btn').onclick = () => {
  const input = document.getElementById('private-chat-input');
  const text = input.value.trim();
  if (!text || !currentChatTarget) return;
  
  const env = createEnvelope('chat', currentRoom, identity.pubKey, identity.privKey, { text });
  if(env) {
    renderMessage(document.getElementById('private-chat-messages'), text, 'Me', true);
    mesh.sendToPeer(currentChatTarget, env);
    input.value = '';
  }
};

function renderMessage(box, text, sender, isSelf) {
  const div = document.createElement('div');
  div.className = isSelf ? "flex justify-end mb-2" : "flex mb-2";
  div.innerHTML = `<div class="${isSelf ? 'bg-brand-600 text-white rounded-br-none' : 'bg-slate-200 text-slate-800 rounded-bl-none'} p-2.5 rounded-2xl text-xs max-w-[80%] shadow-sm">${text}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// STARTUP
initMap();
console.log("Map initialized with OpenStreetMap tiles.");