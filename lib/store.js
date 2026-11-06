import { create } from 'https://esm.run/zustand@4.4.7';

export const useStore = create((set) => ({
  messages: [], 
  peers: new Set(), 
  votes: { eta: [], fullness: [] },
  
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setPeers: (pSet) => set({ peers: pSet }),
  addVote: (type, val) => set((s) => ({ votes: { ...s.votes, [type]: [...s.votes[type], val] } }))
}));