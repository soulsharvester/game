# FPS Zombie (TypeScript + three.js)

A small 3D first-person shooter demo written in TypeScript using **three.js** and **Vite**.

Features
- First-person controls (Pointer Lock + WASD)
- Randomly spawning zombies that path toward the player
- Shoot zombies (left click at center) to earn points
- Simple sandbox environment with obstacles

Run locally
1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Open the URL printed by Vite (usually `http://localhost:5173`)

Controls
- Click the big button / click in the canvas to lock the pointer
- WASD to move, mouse to look
- Left click to shoot (center crosshair)
- Esc to unlock pointer

Notes
- Uses procedural geometry (no external assets)
- Designed as a compact demo — extend as you like (AI, sounds, bullets, levels)

Enjoy! 🎯