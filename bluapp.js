import { getIdentity } from './lib/crypto.js';
import { createEnvelope } from './lib/protocol.js';
import { initMesh } from './lib/mesh.js';

const identity = getIdentity();
document.getElementById('my-id-badge').innerText = identity.shortId;
if(document.getElementById('settings-pubkey')) document.getElementById('settings-pubkey').innerText = identity.pubKey;

const currentRoom = 'global-mesh';
let map;
let myLat = 0, myLng = 0;
let longPressTimer;
let selectedLatLng = null;
let currentChatTarget = null;

const mapNotes = {};
const myVotes = {};
const peerMarkers = {}; // For showing other users on the map

const mesh = initMesh(currentRoom, 
  (env) => {
    if (env.type === 'chat' && currentChatTarget === env.from.substring(0,5)) {
      renderMessage(document.getElementById('private-chat-messages'), env.payload.text, env.from.substring(0,5), false);
    }
    if (env.type === 'map_note') addNoteToMap(env.payload, env.id);
    if (env.type === 'note_vote') {
      const { noteId, vote } = env.payload;
      if (mapNotes[noteId]) { mapNotes[noteId].votes[env.from] = vote; updateNotePopup(noteId); }
    }
  },
  (pid) => { console.log(`Peer joined: ${pid}`); },
  (pid) => { 
    console.log(`Peer left: ${pid}`); 
    if(peerMarkers[pid]) { map.removeLayer(peerMarkers[pid]); delete peerMarkers[pid]; }
    updatePeerCount();
  }
);

// Global function to handle GPS updates from mesh.js
window.handlePeerLocation = function(data) {
  const { senderId, lat, lng } = data;
  if (senderId === mesh.myId) return; // Ignore ourselves

  const peerIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="w-7 h-7 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center shadow-md"><i class="fa-solid fa-user text-white text-[10px]"></i></div>`,
    iconSize: [28, 28], iconAnchor: [14, 14]
  });

  if (peerMarkers[senderId]) {
    peerMarkers[senderId].setLatLng([lat, lng]);
  } else {
    const marker = L.marker([lat, lng], { icon: peerIcon }).addTo(map);
    marker.on('click', () => {
      marker.bindPopup(`
        <div class="p-3 text-center">
          <p class="text-xs font-bold text-slate-800 mb-2">Peer ${senderId.substring(0,5)}</p>
          <button onclick="openPrivateChat('${senderId}', '${senderId.substring(0,5)}')" class="bg-brand-600 text-white text-[10px] font-bold px-4 py-1.5 rounded-lg shadow">Invite to Chat</button>
        </div>
      `).openPopup();
    });
    peerMarkers[senderId] = marker;
    updatePeerCount();
  }
};

function updatePeerCount() {
  const count = Object.keys(peerMarkers).length;
  const el = document.getElementById('peer-count');
  if(el) el.innerText = `${count + 1} Peers`; // +1 for self
}

function initMap() {
  map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  if (navigator.geolocation) {
    navigator.geolocation.watchPosition((pos) => {
      myLat = pos.coords.latitude; myLng = pos.coords.longitude;
      if (map.getZoom() === 5) { map.setView([myLat, myLng], 16); addSelfMarker(); }
    });
  }

  const mapContainer = document.getElementById('map');
  const startPress = (e) => {
    if (e.target.closest('.leaflet-marker-icon')) return;
    const touch = e.touches ? e.touches[0] : e;
    longPressTimer = setTimeout(() => {
      const rect = mapContainer.getBoundingClientRect();
      selectedLatLng = map.containerPointToLatLng([touch.clientX - rect.left, touch.clientY - rect.top]);
      openNoteModal(selectedLatLng);
    }, 800);
  };
  const cancelPress = () => clearTimeout(longPressTimer);
  mapContainer.addEventListener('mousedown', startPress);
  mapContainer.addEventListener('touchstart', startPress, { passive: true });
  mapContainer.addEventListener('mouseup', cancelPress);
  mapContainer.addEventListener('touchend', cancelPress);
  mapContainer.addEventListener('touchmove', cancelPress);
}

function addSelfMarker() {
  const youIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="w-8 h-8 bg-brand-600 border-2 border-white rounded-full flex items-center justify-center shadow-lg"><i class="fa-solid fa-user text-white text-xs"></i></div>`,
    iconSize: [32, 32], iconAnchor: [16, 16]
  });
  L.marker([myLat, myLng], { icon: youIcon }).addTo(map).bindPopup("<b>You are here</b>");
}

window.recenterMap = () => { if (myLat && myLng) map.flyTo([myLat, myLng], 16); };

window.searchLocation = async () => {
  const query = document.getElementById('map-search-input').value.trim();
  if (!query) return;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.length > 0) { map.flyTo([data[0].lat, data[0].lon], 16); L.popup().setLatLng([data[0].lat, data[0].lon]).setContent(data[0].display_name).openOn(map); }
    else alert("Location not found");
  } catch (e) { console.error(e); }
};

// NOTES
function openNoteModal(latLng) {
  document.getElementById('note-coords').innerText = `Lat: ${latLng.lat.toFixed(5)}, Lng: ${latLng.lng.toFixed(5)}`;
  document.getElementById('note-input').value = '';
  document.getElementById('note-modal').classList.remove('hidden');
  document.getElementById('note-modal').classList.add('flex');
  if (navigator.vibrate) navigator.vibrate(50); 
}

window.submitNote = () => {
  const text = document.getElementById('note-input').value.trim();
  if (!text || !selectedLatLng) return;
  const env = createEnvelope('map_note', currentRoom, identity.pubKey, identity.privKey, { lat: selectedLatLng.lat, lng: selectedLatLng.lng, text });
  if (env) { addNoteToMap(env.payload, env.id); mesh.sendRaw(env); closeNoteModal(); }
};

function addNoteToMap(note, noteId) {
  if (mapNotes[noteId]) return;
  const noteIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="w-8 h-8 bg-amber-400 border-2 border-white rounded-full flex items-center justify-center shadow-lg"><i class="fa-solid fa-message text-white text-xs"></i></div>`,
    iconSize: [32, 32], iconAnchor: [16, 16]
  });
  const marker = L.marker([note.lat, note.lng], { icon: noteIcon }).addTo(map);
  mapNotes[noteId] = { ...note, marker, votes: {} };
  marker.on('click', () => { updateNotePopup(noteId); mapNotes[noteId].marker.bindPopup(getPopupHtml(noteId)).openPopup(); });
}

function getPopupHtml(noteId) {
  const note = mapNotes[noteId];
  const score = Object.values(note.votes).reduce((a, b) => a + b, 0);
  if (score <= -3) return `<div class="p-3 text-center text-xs text-slate-500">Note hidden by community.</div>`;
  return `
    <div class="p-3 max-w-[200px]">
      <p class="text-xs font-bold text-slate-800 mb-2">${note.text}</p>
      <div class="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
        <button onclick="voteNote('${noteId}', 1)" class="flex items-center gap-1 text-emerald-600 px-2 py-1 rounded"><i class="fa-solid fa-thumbs-up"></i> <span>${Object.values(note.votes).filter(v=>v===1).length}</span></button>
        <button onclick="voteNote('${noteId}', -1)" class="flex items-center gap-1 text-rose-600 px-2 py-1 rounded"><i class="fa-solid fa-thumbs-down"></i></button>
      </div>
    </div>
  `;
}

function updateNotePopup(noteId) {
  if (mapNotes[noteId] && mapNotes[noteId].marker.isPopupOpen()) mapNotes[noteId].marker.setPopupContent(getPopupHtml(noteId));
}

window.voteNote = (noteId, voteValue) => {
  const note = mapNotes[noteId];
  if (!note) return;
  if (myVotes[noteId] === voteValue) { delete note.votes[identity.pubKey]; delete myVotes[noteId]; } 
  else { note.votes[identity.pubKey] = voteValue; myVotes[noteId] = voteValue; }
  updateNotePopup(noteId);
  const env = createEnvelope('note_vote', currentRoom, identity.pubKey, identity.privKey, { noteId, vote: voteValue });
  if (env) mesh.sendRaw(env);
};

// PRIVATE CHAT
window.openPrivateChat = (peerId, displayName) => {
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
  if(env) { renderMessage(document.getElementById('private-chat-messages'), text, 'Me', true); mesh.sendToPeer(currentChatTarget, env); input.value = ''; }
};

function renderMessage(box, text, sender, isSelf) {
  const div = document.createElement('div');
  div.className = isSelf ? "flex justify-end mb-2" : "flex mb-2";
  div.innerHTML = `<div class="${isSelf ? 'bg-brand-600 text-white rounded-br-none' : 'bg-slate-200 text-slate-800 rounded-bl-none'} p-2.5 rounded-2xl text-xs max-w-[80%] shadow-sm">${text}</div>`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
}

// STARTUP
initMap();