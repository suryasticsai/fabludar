import { Octokit } from "https://esm.run/@octokit/rest";

// ==========================================
// 1. GITHUB OCTOKIT SETUP & AUTH
// ==========================================
let octokit = null;

// Initialize Octokit if a token exists
function initOctokit() {
  const token = localStorage.getItem('fabludar_gh_token');
  if (token) {
    octokit = new Octokit({ auth: token });
    console.log("GitHub Octokit initialized.");
    return true;
  }
  return false;
}

// Ask user for GitHub Token (Required for Gists)
window.promptGitHubToken = function() {
  const token = prompt("To save data as Gists, enter your GitHub Personal Access Token (needs 'gist' scope):");
  if (token) {
    localStorage.setItem('fabludar_gh_token', token);
    initOctokit();
    alert("Token saved! You can now save to Gists.");
  }
};

// ==========================================
// 2. SAVE DATA TO GIST (JSON)
// ==========================================
window.saveToGist = async function(dataType) {
  if (!initOctokit()) {
    const wantsToAuth = confirm("You need a GitHub Token to save Gists. Setup now?");
    if (wantsToAuth) promptGitHubToken();
    return;
  }

  let dataToSave = {};
  let filename = 'fabludar_data.json';
  let description = 'faBludar Mesh Data';

  // Gather data based on type
  if (dataType === 'notes') {
    // Assuming mapNotes is globally accessible or we can grab it
    dataToSave = window.getMapNotes ? window.getMapNotes() : { error: "No notes found" };
    filename = 'fabludar_map_notes.json';
    description = 'faBludar Map Notes Backup';
  } else if (dataType === 'chats') {
    const chats = document.getElementById('private-chat-messages')?.innerHTML || "No chats";
    dataToSave = { timestamp: Date.now(), chats: chats };
    filename = 'fabludar_chats.json';
    description = 'faBludar Chat Backup';
  } else {
    // Default: Save entire app state
    dataToSave = {
      identity: localStorage.getItem('fabludar_pub'),
      timestamp: Date.now(),
      room: document.getElementById('room-id-display')?.innerText || 'Unknown'
    };
  }

  const content = JSON.stringify(dataToSave, null, 2);

  try {
    // Show loading state
    const originalText = document.activeElement?.innerText;
    if (document.activeElement) document.activeElement.innerText = "Saving...";

    const response = await octokit.gists.create({
      description: description,
      public: false,
      files: {
        [filename]: { content: content }
      }
    });

    alert(`Success! Saved to Gist.\nURL: ${response.data.html_url}`);
    
    // Restore button text
    if (document.activeElement) document.activeElement.innerText = originalText;

  } catch (error) {
    console.error("Gist Error:", error);
    alert("Failed to save to Gist. Check your token permissions (needs 'gist' scope).");
  }
};

// ==========================================
// 3. CREATE OPTIONS (FAB & Feed)
// ==========================================

// Create a post on the Feed
window.createPost = function() {
  const content = prompt("What do you want to broadcast to the bus?");
  if (!content) return;

  // Check if mesh is available (from bluapp.js)
  const mesh = window.AppMesh ? window.AppMesh() : null;
  const identity = window.AppIdentity || null;

  if (mesh && identity) {
    // Import dynamically to avoid top-level circular dependencies
    import('./lib/protocol.js').then(({ createEnvelope }) => {
      const env = createEnvelope('chat', mesh.roomId, identity.pubKey, identity.privKey, { text: content });
      if (env) {
        mesh.sendRaw(env);
        alert("Post broadcasted to the mesh!");
        // Optionally save this post to a gist automatically
        saveToGist('chats'); 
      }
    });
  } else {
    alert("Mesh not connected yet. Please wait.");
  }
};

// Broadcast SOS
window.broadcastSOS = function() {
  const mesh = window.AppMesh ? window.AppMesh() : null;
  const identity = window.AppIdentity || null;

  if (mesh && identity) {
    import('./lib/protocol.js').then(({ createEnvelope }) => {
      const env = createEnvelope('alert', mesh.roomId, identity.pubKey, identity.privKey, { text: "🚨 SOS EMERGENCY" });
      if (env) {
        mesh.sendRaw(env);
        alert("SOS Broadcasted to all peers!");
      }
    });
  }
};

// ==========================================
// 4. UI ROUTING & MODALS
// ==========================================
window.switchPage = function(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageName}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn => { 
    btn.classList.remove('text-brand-600'); 
    btn.classList.add('text-slate-400'); 
  });
  const nav = document.getElementById(`nav-${pageName}`);
  if(nav) { 
    nav.classList.remove('text-slate-400'); 
    nav.classList.add('text-brand-600'); 
  }
};

window.toggleFABModal = function() {
  const modal = document.getElementById('fab-modal');
  if (modal) {
    if (modal.classList.contains('hidden')) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      setTimeout(() => modal.classList.add('open'), 10);
    } else {
      closeFABModal();
    }
  }
};

window.closeFABModal = function() {
  const modal = document.getElementById('fab-modal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }, 300);
  }
};

window.wipeData = function() {
  if (confirm("Are you sure you want to delete your identity and wipe all local data? This cannot be undone.")) {
    localStorage.clear();
    window.location.reload();
  }
};

// Initialize Octokit on load
initOctokit();