document.addEventListener('DOMContentLoaded', () => {
    console.log("Feedster loaded. Ready to render posts.");
    
    window.createMockPost = function(text) {
        const feedContainer = document.getElementById('page-feed');
        const newPost = document.createElement('div');
        newPost.className = "bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-3 mt-4";
        newPost.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">You</div>
              <div>
                <h4 class="text-xs font-bold text-slate-800">You</h4>
                <p class="text-[10px] text-slate-400">Just now</p>
              </div>
            </div>
            <span class="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-lg">#Mesh</span>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed">${text}</p>
        `;
        feedContainer.appendChild(newPost);
    };
});