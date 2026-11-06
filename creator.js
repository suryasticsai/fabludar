import { Octokit } from "https://esm.run/@octokit/rest";

let octokit = null;
let autosaveTimer = null;
let isSyncing = false;

// Global backup object to hold everything before syncing
window.AppBackupData = {
  messages: [],
  notes: [],
  room: "Unknown",
  identity: { pubKey: "", privKey: "" }
};

// ==========================================
// 1. GITHUB OCTOKIT SETUP
// ==========================================
function initOctokit() {
  const token = localStorage.getItem('fabludar_gh_token');
  if (token) {
    octokit = new Octokit({ auth: token });
    return true;
  }
  return false;
}

window.promptGitHubToken = function() {
  const token = prompt("Enter your GitHub Personal Access Token (needs 'gist' scope) to enable Autosave:");
  if (token) {
    localStorage.setItem('fabludar_gh_token', token);
    initOctokit();
    alert("Token saved! Autosave is now active.");
  }
};

window.toggleAutosave = function(isEnabled) {
  localStorage.setItem('fabludar_autosave_enabled', isEnabled);
  if (isEnabled && !initOctokit()) {
    alert("Please set up your GitHub Token first.");
    document.getElementById('autosave-toggle').checked = false;
    localStorage.setItem('fabludar_autosave_enabled', false);
  }
};

// ==========================================
// 2. AUTOSAVE ENGINE (Debounced)
// ==========================================
window.triggerAutosave = function() {
  if (localStorage.getItem('fabludar_autosave_enabled') !== 'true') return;
  if (isSyncing) return;

  // Clear existing timer and start a new 10-second countdown
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(syncToGist, 10000); 
};

async function syncToGist() {
  if (!initOctokit()) return;
  isSyncing = true;
  
  // Update UI to show syncing (optional)
  const statusEl = document.getElementById('sync-status');
  if (statusEl) statusEl.innerText = "Syncing...";

  const files = {
    "messages.json": { content: JSON.stringify(window.AppBackupData.messages, null, 2) },
    "notes.json": { content: JSON.stringify(window.AppBackupData.notes, null, 2) },
    "identity.json": { content: JSON.stringify(window.AppBackupData.identity, null, 2) },
    "room_info.json": { content: JSON.stringify({ room: window.AppBackupData.room, lastUpdated: new Date().toISOString() }, null, 2) }
  };

  const existingGistId = localStorage.getItem('fabludar_master_gist_id');

  try {
    if (existingGistId) {
      // Update existing Gist
      await octokit.gists.update({
        gist_id: existingGistId,
        description: "faBludar Mesh Autosave Data",
        files: files
      });
      console.log("Autosaved to existing Gist:", existingGistId);
    } else {
      // Create a new Gist
      const response = await octokit.gists.create({
        description: "faBludar Mesh Autosave Data",
        public: false,
        files: files
      });
      localStorage.setItem('fabludar_master_gist_id', response.data.id);
      console.log("Created new Master Gist:", response.data.id);
    }
    
    if (statusEl) {
      statusEl.innerText = "All changes saved";
      setTimeout(() => { statusEl.innerText = ""; }, 3000);
    }
  } catch (error) {
    console.error("Autosave Failed:", error);
    if (statusEl) statusEl.innerText = "Sync failed (Check token)";
  } finally {
    isSyncing = false;
  }
}

// ==========================================
// 3. UI HANDLERS (FAB & Nav)
// ==========================================
window.switchPage = function(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageName}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn => { btn.classList.remove('text-brand-600'); btn.classList.add('text-slate-400'); });
  const nav = document.getElementById(`nav-${pageName}`);
  if(nav) { nav.classList.remove('text-slate-400'); nav.classList.add('text-brand-600'); }
};

window.wipeData = function() {
  if (confirm("Wipe all local data and delete Token?")) {
    localStorage.clear();
    window.location.reload();
  }
};

initOctokit();