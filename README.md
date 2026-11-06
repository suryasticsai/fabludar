# 📡 faBludar (fabludar)

**All Community Commuters. One Mesh. One Chat. One Place.**

faBludar is a 100% serverless, decentralized, offline-first communication network for commuters. Built entirely on WebRTC and hosted for free on GitHub Pages. No backend. No database. No tracking.

## 🚀 Features
- **Offline P2P Mesh:** Connects phones directly via WebRTC (Trystero).
- **End-to-End Encryption:** Every message is cryptographically signed using Ed25519 keys generated on your device.
- **QR Room Join:** Scan a QR code to instantly join a local room (e.g., `?room=bus-42`).
- **Crowdsourced Commute:** Vote on ETAs, check seat availability, and report traffic.
- **Installable PWA:** Add to your home screen for a native app experience.

## 📱 How to use
1. Open the app on two devices.
2. Click the QR icon to share a room link.
3. Send a message and watch the radar detect nearby peers.

## 🛠️ Tech Stack
- Vanilla HTML/CSS (Tailwind)
- Zustand (State)
- Trystero (WebRTC Mesh)
- TweetNaCl (Cryptography)