import { useStore } from './lib/store.js';
import { createEnvelope } from './lib/protocol.js';

window.castVote = function(category, value) {
  const identity = window.AppIdentity; 
  const room = window.AppRoom;
  const mesh = window.AppMesh;
  
  if (!identity || !room || !mesh) return;

  const env = createEnvelope('vote', room, identity.pubKey, identity.privKey, { category, value });
  if(env) {
    mesh.seenMessageIds.add(env.id);
    mesh.sendRaw(env);
    
    useStore.getState().addVote(category, value);
    updateVotesUI();
    alert(`Vote cast: ${value}`);
  }
};

window.updateVotesUI = function() {
  const votes = useStore.getState().votes.eta;
  if (votes.length > 0) {
    const sorted = [...votes].sort((a,b) => a-b);
    const median = sorted[Math.floor(sorted.length / 2)];
    document.getElementById('eta-display').innerText = median;
  }
};

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