# ROADMAP

## Overview

The SF2 & MIDI Workstation project is divided into 4 execution phases designed to iteratively build the core audio engine, UI mixer, preset manager, and cross-platform Electron integration.

---

## Phase 1: Core Project Setup, Audio Engine & SF2 Sampler Engine
**Goal**: Set up project structure, Web Audio API context, SoundFont (SF2) binary parser, wavetable synthesis engine, ADSR envelope, polyphony management, and basic audio test interface.

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

## Phase 3: MIDI Player, Interactive Keyboard & Preset Management System
**Goal**: Implement MIDI file player (`.mid`), interactive multi-touch/QWERTY piano keyboard with WebMIDI USB support, and complete Preset Saving/Loading System (`js/preset-manager.js`).

### Deliverables:
- MIDI parser & transport player (`js/midi-parser.js`, `js/player.js`).
- Piano keyboard component (`js/keyboard.js`, `js/web-midi.js`).
- Preset Manager with Save, Load, Export/Import JSON, and LocalStorage persistence.

---

## Phase 4: UI Polish, Electron Integration & Mobile PWA
**Goal**: Finalize Dark-mode Glassmorphism design system, Electron desktop wrapper (`main.js`, `preload.js`), PWA manifest/service worker, keyboard shortcuts, and full verification.

### Deliverables:
- Electron desktop setup (`main.js`, `preload.js`, package scripts).
- PWA manifest & responsive mobile CSS (`manifest.json`, `css/main.css`).
- Final verification and walkthrough.
