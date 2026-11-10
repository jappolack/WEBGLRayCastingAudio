# WEBGLRayCastingAudio

A small Three.js coin-collection demo. Move the character around the ground, collect coins, and watch the score increase. A roaming opponent uses raycasting to detect the woman; when he gets close, she draws her pistol. Press `F` to fire. A shot only defeats him if its ray hits.

## Run

Serve the project from its root directory over HTTP (ES modules and model/audio assets do not work reliably from a `file://` URL):

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in a browser. Three.js is loaded from jsDelivr, so the browser needs network access to that CDN.

## Controls

- `W`, `A`, `S`, `D` or the arrow keys: move the character
- `Space`: collect a coin when close to it
- `F`: fire the pistol when the bad guy is nearby

Coins are relocated to new ground positions after collection. The score increases by one, and the character plays the pickup animation.

## Project Files

- `index.html`: page and Three.js import map
- `js/main.js`: scene, controls, animations, and coin collection
- `models/female.glb`: character model and animations
- `models/badguy.glb`: roaming opponent model and animations
- `models/pistol.glb`: pistol attached to the woman's right hand
- `audio/coin.mp3`: coin collection sound