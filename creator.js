window.toggleFABModal = function() {
  const modal = document.getElementById('fab-modal');
  // Since we removed FAB modal from index.html to save space, let's just alert for now
  alert("Quick Actions Menu: Post, SOS, Share Location.");
};

window.showQRCode = function() {
  const modal = document.getElementById('qr-modal');
  if(!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  const qrContainer = document.getElementById('qrcode-container');
  qrContainer.innerHTML = ''; 
  const roomLink = `${window.location.origin}${window.location.pathname}?room=global-mesh`;
  new QRCode(qrContainer, { text: roomLink, width: 180, height: 180, colorDark : "#1e293b", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.H });
};

window.closeQRCode = () => { const m = document.getElementById('qr-modal'); if(m) { m.classList.add('hidden'); m.classList.remove('flex'); } };
window.copyRoomLink = () => { navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=global-mesh`); alert("Link copied!"); };
window.closePrivateChat = () => { document.getElementById('private-chat-modal').classList.add('hidden'); document.getElementById('private-chat-modal').classList.remove('flex'); };
window.closeNoteModal = () => { document.getElementById('note-modal').classList.add('hidden'); document.getElementById('note-modal').classList.remove('flex'); };
window.wipeData = () => { if(confirm("Wipe data?")) { localStorage.clear(); window.location.reload(); } };

window.switchPage = function(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageName}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn => { btn.classList.remove('text-brand-600'); btn.classList.add('text-slate-400'); });
  const nav = document.getElementById(`nav-${pageName}`);
  if(nav) { nav.classList.remove('text-slate-400'); nav.classList.add('text-brand-600'); }
};