window.showQRCode = function() {
  const modal = document.getElementById('qr-modal');
  if(!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  
  const qrContainer = document.getElementById('qrcode-container');
  qrContainer.innerHTML = ''; 
  
  const currentRoom = window.AppRoom || 'global-mesh';
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
  const currentRoom = window.AppRoom || 'global-mesh';
  const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
  navigator.clipboard.writeText(link);
  alert("Link copied to clipboard!");
};

// FAB Modal Logic
window.toggleFABModal = function() {
  const modal = document.getElementById('fab-modal');
  if (modal.classList.contains('hidden')) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => modal.classList.add('open'), 10);
  } else {
    closeFABModal();
  }
};

window.closeFABModal = function() {
  const modal = document.getElementById('fab-modal');
  modal.classList.remove('open');
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }, 300);
};

window.wipeData = function() {
  if (confirm("Are you sure you want to delete your identity and wipe all local data? This cannot be undone.")) {
    localStorage.clear();
    window.location.reload();
  }
};