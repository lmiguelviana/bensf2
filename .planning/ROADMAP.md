# ROADMAP

## Overview

The SF2 Live Sampler Workstation project is divided into 4 execution phases focused on building a high-performance live instrument rack for USB/Bluetooth MIDI keyboards with preset saving.

---

## Phase 1: Core Project Setup, Audio Engine & SF2 Sampler Engine
**Goal**: Set up project structure, Web Audio API context, SoundFont (SF2) binary parser, wavetable synthesis engine, ADSR envelope, polyphony management, and audio test interface.

### Deliverables:
- Project manifest (`package.json`, Electron main process setup).
- SF2 soundfont parser & synthesizer engine (`js/sf2-parser.js`, `js/synth-engine.js`, `js/audio-context.js`).
- Default soundfont asset.
- Verification test page.

---

## Phase 2: Multitimbric Mixer Console & FX Rack Engine
**Goal**: Build 16-channel Mixer console with Volume Faders, Pan knobs, Mute/Solo, stereo VU Meters, and FX Rack (Reverb, Delay, 3-Band EQ, Master Limiter).

### Deliverables:
- Mixer UI & audio routing (`js/mixer.js`, `css/mixer.css`).
- FX Rack audio nodes (`js/fx-rack.js`, `css/synth-rack.css`).
- Real-time VU meter canvas/animation loop.

---

## Phase 3: WebMIDI USB/Bluetooth Keyboard Engine, Touch Keyboard & Preset Management
**Goal**: Implement real-time WebMIDI controller input handler (Note On/Off, Pitch Bend, CC1, CC64, Program Change), touch/QWERTY piano keyboard, and complete Preset Saving/Loading System (`js/preset-manager.js`).

### Deliverables:
- WebMIDI input manager (`js/web-midi.js`).
- Multi-touch & QWERTY piano keyboard (`js/keyboard.js`).
- Preset Manager with Save, Load, Export/Import JSON, and LocalStorage/Electron persistence.

---

## Phase 4: UI Polish, Electron Integration & Mobile PWA
**Goal**: Finalize Dark-mode Glassmorphism design system, Electron desktop wrapper (`main.js`, `preload.js`), PWA manifest/service worker, keyboard shortcuts, and full verification.

### Deliverables:
- Electron desktop setup (`main.js`, `preload.js`, package scripts).
- PWA manifest & responsive mobile CSS (`manifest.json`, `css/main.css`).
- Final verification and walkthrough.
