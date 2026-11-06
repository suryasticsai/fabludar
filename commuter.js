import { useStore } from './lib/store.js'; // If you have Zustand, or just vanilla JS
import { createEnvelope } from './lib/protocol.js';

window.castVote = function(category, value) {
  const identity = window.AppIdentity; // Set globally in bluapp.js
  const room = 'global-mesh';
  const mesh = window.AppMesh;

  console.log(`Vote cast: ${value}`);
  // If mesh exists, send envelope
  if (mesh && identity) {
    const env = createEnvelope('vote', room, identity.pubKey, identity.privKey, { category, value });
    if (env) mesh.sendRaw(env);
  }
  document.getElementById('eta-display').innerText = value;
};

// Render Seat Map
const seatGrid = document.getElementById('seat-grid');
if(seatGrid) {
  for (let i = 1; i <= 12; i++) {
    const seat = document.createElement('div');
    seat.className = "w-8 h-8 rounded-lg bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center cursor-pointer shadow-sm transition-all active:scale-90";
    seat.innerText = i;
    seat.onclick = () => {
      if (seat.classList.contains('bg-brand-500')) { seat.classList.replace('bg-brand-500', 'bg-slate-300'); seat.classList.replace('text-white', 'text-slate-500'); } 
      else { seat.classList.replace('bg-slate-300', 'bg-brand-500'); seat.classList.replace('text-slate-500', 'text-white'); }
    };
    seatGrid.appendChild(seat);
  }
}