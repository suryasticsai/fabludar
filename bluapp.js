import { getIdentity } from './lib/crypto.js';
import { createEnvelope } from './lib/protocol.js';
import { initMesh } from './lib/mesh.js';

const identity = getIdentity();
let mesh = null;
let map;
let myLat = 0, myLng = 0;
let currentChatTarget = null;
let pinModeActive = false; 
let selectedLatLng = null;

const mapNotes = {};
const myVotes = {};
const peerMarkers = {}; 
const activePeers = {}; 

// Setup Global Backup Data for Autosave
window.AppBackupData = { messages: [], notes: [], room: "Unknown", identity: identity };
window.AppIdentity = identity;

// ==========================================
// 1. GEOHASH ENGINE
// ==========================================
function getGeohash(lat, lng) {
  const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let idx = 0, bit = 0, evenBit = true;
  let geohash = '';
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  
  while (geohash.length < 5) { // Precision 5 = ~4.9km
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (lng > lonMid) { idx = idx * 2 + 1; lonMin = lonMid; } 
      else { idx = idx * 2; lonMax = lonMid; }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat > latMid) { idx = idx * 2 + 1; latMin = latMid; } 
      else { idx = idx * 2; latMax = latMid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { geohash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return geohash;
}

// ==========================================
// 2. GPS & BOOTSTRAP
// ==========================================
window.requestGPS = function() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        myLat = pos.coords.latitude;
        myLng = pos.coords.longitude;
        
        const geohash = getGeohash(myLat, myLng);
        document.getElementById('room-id-display').innerText = `Room: ${geohash}`;
        window.AppBackupData.room = geohash;
        
        document.getElementById('gps-screen').style.display = 'none';
        
        initMap();
        startMesh(geohash);
      },
      (err) => {
        alert("GPS Error: " + err.message + "\n\nPlease ensure location services are enabled and you are using HTTPS.");
      },
      { enableHighAccuracy: true }
    );
  } else {
    alert("Geolocation is not supported by this browser.");
  }
};

function startMesh(roomId) {
  mesh = initMesh(roomId, 
    (env) => {
      // Save to autosave buffer
      if (window.AppBackupData) {
        window.AppBackupData.messages.push(env);
        if (window.triggerAutosave) window.triggerAutosave();
      }

      if (env.type === 'chat' && currentChatTarget === env.from.substring(0,5)) {
        renderMessage(document.getElementById('private-chat-messages'), env.payload.text, env.from.substring(0,5), false);
      }
      if (env.type === 'map_note') addNoteToMap(env.payload, env.id);
      if (env.type === 'note_vote') {
        const { noteId, vote } = env.payload;
        if (mapNotes[noteId]) { mapNotes[noteId].votes[env.from] = vote; updateNotePopup(noteId); }
      }
    },
    (pid) => { 
      console.log(`Peer joined: ${pid}`); 
      activePeers[pid] = { id: pid, name: pid.substring(0,5) };
      updatePeerList();
    },
    (pid) => { 
      console.log(`Peer left: ${pid}`); 
      delete activePeers[pid];
      if(peerMarkers[pid]) { map.removeLayer(peerMarkers[pid]); delete peerMarkers[pid]; }
      updatePeerList();
    }
  );
  window.AppMesh = () => mesh;
}

// ==========================================
// 3. MAP & UBER UI LOGIC
// ==========================================
function initMap() {
  map = L.map('map', { zoomControl: false }).setView([myLat, myLng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  addSelfMarker();

  map.on('click', (e) => {
    if (pinModeActive) {
      selectedLatLng = e.latlng;
      openNoteModal(selectedLatLng);
      togglePinMode(false); 
    }
  });

  navigator.geolocation.watchPosition((pos) => {
    myLat = pos.coords.latitude;
    myLng = pos.coords.longitude;
    if(window.selfMarker) window.selfMarker.setLatLng([myLat, myLng]);
  });
}

function addSelfMarker() {
  const youIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="relative flex items-center justify-center"><div class="absolute w-12 h-12 bg-blue-500/20 rounded-full animate-ping"></div><div class="w-5 h-5 bg-blue-600 border-[3px] border-white rounded-full shadow-[0_0_15px_rgba(37,99,235,0.5)] z-10"></div></div>`,
    iconSize: [48, 48], iconAnchor: [24, 24]
  });
  window.selfMarker = L.marker([myLat, myLng], { icon: youIcon, zIndexOffset: 1000 }).addTo(map);
}

window.handlePeerLocation = function(data) {
  const { senderId, lat, lng } = data;
  if (senderId === mesh.myId) return; 

  const peerIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="bg-slate-900 border-2 border-white shadow-lg rounded-full px-2 py-1 flex items-center gap-1.5"><i class="fa-solid fa-user text-[10px] text-white"></i><span class="text-[9px] font-bold text-white">${senderId.substring(0,4).toUpperCase()}</span></div>`,
    iconSize: [50, 24], iconAnchor: [25, 12]
  });

  if (peerMarkers[senderId]) {
    peerMarkers[senderId].setLatLng([lat, lng]);
  } else {
    const marker = L.marker([lat, lng], { icon: peerIcon }).addTo(map);
    marker.on('click', () => {
      marker.bindPopup(`<div class="p-3 text-center w-40"><h3 class="text-xs font-bold mb-2">Peer ${senderId.substring(0,4)}</h3><button onclick="openPrivateChat('${senderId}', '${senderId.substring(0,4)}')" class="w-full bg-brand-600 text-white text-[10px] font-bold px-3 py-2 rounded-lg">Message</button></div>`).openPopup();
    });
    peerMarkers[senderId] = marker;
    updatePeerCount();
  }
};

window.togglePinMode = function(forceState) {
  pinModeActive = forceState !== undefined ? forceState : !pinModeActive;
  const btn = document.getElementById('pin-note-btn');
  if (pinModeActive) {
    btn.classList.add('bg-amber-600', 'ring-4', 'ring-amber-300');
    btn.classList.remove('bg-amber-400');
    btn.innerHTML = '<i class="fa-solid fa-location-dot text-lg"></i>';
    document.getElementById('map').style.cursor = 'crosshair';
  } else {
    btn.classList.remove('bg-amber-600', 'ring-4', 'ring-amber-300');
    btn.classList.add('bg-amber-400');
    btn.innerHTML = '<i class="fa-solid fa-thumbtack text-lg"></i>';
    document.getElementById('map').style.cursor = '';
  }
};

// ==========================================
// 4. NOTES & VOTING
// ==========================================
function openNoteModal(latLng) {
  document.getElementById('note-coords').innerText = `Lat: ${latLng.lat.toFixed(5)}, Lng: ${latLng.lng.toFixed(5)}`;
  document.getElementById('note-input').value = '';
  document.getElementById('note-modal').classList.remove('hidden');
  document.getElementById('note-modal').classList.add('flex');
}

window.closeNoteModal = () => { document.getElementById('note-modal').classList.add('hidden'); document.getElementById('note-modal').classList.remove('flex'); };

window.submitNote = () => {
  const text = document.getElementById('note-input').value.trim();
  if (!text || !selectedLatLng) return;
  const env = createEnvelope('map_note', mesh.roomId, identity.pubKey, identity.privKey, { lat: selectedLatLng.lat, lng: selectedLatLng.lng, text });
  if (env) { addNoteToMap(env.payload, env.id); mesh.sendRaw(env); closeNoteModal(); }
};

function addNoteToMap(note, noteId) {
  if (mapNotes[noteId]) return;
  
  if (window.AppBackupData) {
    window.AppBackupData.notes.push({ noteId, ...note });
    if (window.triggerAutosave) window.triggerAutosave();
  }

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
  return `<div class="p-3 max-w-[200px]"><p class="text-xs font-bold text-slate-800 mb-2">${note.text}</p><div class="flex items-center justify-between mt-3 pt-2 border-t border-slate-100"><button onclick="voteNote('${noteId}', 1)" class="flex items-center gap-1 text-emerald-600 px-2 py-1 rounded"><i class="fa-solid fa-thumbs-up"></i> <span>${Object.values(note.votes).filter(v=>v===1).length}</span></button><button onclick="voteNote('${noteId}', -1)" class="flex items-center gap-1 text-rose-600 px-2 py-1 rounded"><i class="fa-solid fa-thumbs-down"></i></button></div></div>`;
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
  const env = createEnvelope('note_vote', mesh.roomId, identity.pubKey, identity.privKey, { noteId, vote: voteValue });
  if (env) mesh.sendRaw(env);
};

// ==========================================
// 5. CHATS & PEER LIST
// ==========================================
function updatePeerList() {
  const list = document.getElementById('peer-list');
  const count = Object.keys(activePeers).length;
  document.getElementById('peer-count').innerText = `${count + 1} Peers`; 
  
  if (count === 0) {
    list.innerHTML = `<div class="text-center text-sm text-slate-400 py-10">No peers nearby. Make sure they have the app open.</div>`;
    return;
  }

  list.innerHTML = Object.values(activePeers).map(peer => `
    <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between cursor-pointer active:scale-95 transition" onclick="openPrivateChat('${peer.id}', '${peer.name}')">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold"><i class="fa-solid fa-user"></i></div>
        <div>
          <h4 class="text-sm font-bold text-slate-800">Commuter ${peer.name}</h4>
          <p class="text-[10px] text-slate-500">Tap to open exclusive chat</p>
        </div>
      </div>
      <i class="fa-solid fa-chevron-right text-slate-300"></i>
    </div>
  `).join('');
}

function updatePeerCount() {
  const count = Object.keys(peerMarkers).length;
  document.getElementById('peer-count').innerText = `${count + 1} Peers`;
}

window.openPrivateChat = (peerId, displayName) => {
  if(map) map.closePopup();
  currentChatTarget = peerId;
  document.getElementById('private-chat-title').innerText = `Chat with ${displayName}`;
  document.getElementById('private-chat-modal').classList.remove('hidden');
  document.getElementById('private-chat-modal').classList.add('flex');
  switchPage('chats'); 
};

window.closePrivateChat = () => { 
  currentChatTarget = null;
  document.getElementById('private-chat-modal').classList.add('hidden'); 
  document.getElementById('private-chat-modal').classList.remove('flex'); 
};

document.getElementById('private-send-btn').onclick = () => {
  const input = document.getElementById('private-chat-input');
  const text = input.value.trim();
  if (!text || !currentChatTarget) return;
  const env = createEnvelope('chat', mesh.roomId, identity.pubKey, identity.privKey, { text });
  if(env) { renderMessage(document.getElementById('private-chat-messages'), text, 'Me', true); mesh.sendToPeer(currentChatTarget, env); input.value = ''; }
};

function renderMessage(box, text, sender, isSelf) {
  const div = document.createElement('div');
  div.className = isSelf ? "flex justify-end mb-2" : "flex mb-2";
  div.innerHTML = `<div class="${isSelf ? 'bg-brand-600 text-white rounded-br-none' : 'bg-slate-200 text-slate-800 rounded-bl-none'} p-2.5 rounded-2xl text-xs max-w-[80%] shadow-sm">${text}</div>`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
}

// Debug Console
const originalLog = console.log;
console.log = (...args) => { originalLog(...args); const el = document.getElementById('console-output'); if(el) el.innerHTML += `<div class="mb-1 text-emerald-400">${args.join(' ')}</div>`; };