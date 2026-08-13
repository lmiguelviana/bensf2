---
status: awaiting_human_verify
trigger: "OUTRA COISA O SISTEMA TEM CANAIS MIDIS, VI QUE NAO FUNCIONA, E VELOCITIY, PRA USAR QUANDO BATER FORTE NA TELA FUNCIONAR E BATE FRANCO O SOM SER MAIS FRACO COMO UM PIANO TAMBÉM NAO FUNCIOA DIREITO, PREICOS QUE NALAISE OS PROJETOS E TESTE ISSO"
created: 2026-08-12T23:00:00-03:00
updated: 2026-08-12T23:51:00-03:00
---

## Current Focus

hypothesis: H1 — an incoming MIDI channel can incorrectly trigger the same-numbered internal track even when that track is explicitly assigned to another MIDI channel, because `ch === channel` is ORed into both noteOn and noteOff routing
test: focused routing/velocity/device regressions, complete suite with a real GeneralUser-GS bank, repeated stability runs, JavaScript syntax checks, and git diff validation
expecting: explicit routing, expressive/effective velocity, exact held-note release, device lifecycle, visualizers, and saved state remain deterministic without regressions
next_action: human verification with a physical multi-channel MIDI controller and real mouse/touch/pen input in Browser/Electron

## Symptoms

expected: each MIDI channel routes to its configured track/instrument; physical MIDI and screen interaction preserve expressive velocity so soft input is quiet and strong input is loud, like a piano
actual: MIDI channels do not work as expected and velocity response is incorrect or insufficient
errors: no runtime error was reported; the failure is behavioral
reproduction: use the system MIDI-channel controls and play from a MIDI keyboard or the on-screen keyboard with weak and strong input
started: observed in the current system; whether it ever worked correctly is unknown

## Eliminated

## Evidence

- timestamp: 2026-08-12T23:08:00-03:00
  checked: .planning/debug/knowledge-base.md
  found: no knowledge base exists, so there is no known-pattern candidate to prioritize
  implication: proceed with direct code-path evidence and common-pattern hypotheses

- timestamp: 2026-08-12T23:08:00-03:00
  checked: repository inventory and git status
  found: MIDI/audio code is concentrated in js/web-midi.js, js/app.js, js/synth-engine.js, js/sf2-parser.js, and js/velocity-visualizer.js; those core files and the test directory already contain uncommitted or untracked work
  implication: preserve and build on the existing work; do not revert or overwrite unrelated/parallel changes

- timestamp: 2026-08-12T23:13:00-03:00
  checked: WebMidiManager.handleMidiMessage and note-dispatch call sites
  found: physical Note On forwards the original 1-127 velocity and resolved MIDI channel to SynthEngine, but SynthEngine routing includes a track-index fallback (`ch === channel`); on-screen keyboard and pad callers found so far pass a constant velocity of 100
  implication: WebMIDI decoding itself preserves both fields; likely defects are downstream routing semantics and a separate fixed-velocity screen-input path

- timestamp: 2026-08-12T23:24:00-03:00
  checked: full SynthEngine noteOn/noteOff implementation and Mixer routing setter
  found: Mixer stores explicit channel choices as numbers, but SynthEngine accepts a track when `assignedMidiChannel` is `all`, equals the incoming channel, OR the internal track index equals it; the last clause independently defeats an explicit mismatch
  implication: this is a direct data-contract/routing bug, not a UI parse problem, and noteOff repeats the same faulty predicate

- timestamp: 2026-08-12T23:24:00-03:00
  checked: WebMidiManager CC7 and pitch-bend dispatch versus SynthEngine channel model
  found: CC7 calls setChannelVolume(targetChannel) and pitch bend calls setPitchBend(targetChannel), both treating an incoming/mapped MIDI channel as an internal track index instead of resolving every track assigned to that MIDI channel
  implication: notes and channel controls follow different routing semantics; a shared MIDI-to-track resolver is needed

- timestamp: 2026-08-12T23:24:00-03:00
  checked: full app.js virtual piano and QWERTY handlers
  found: mouse/touch piano events and QWERTY keydown all call synth.noteOn with velocity 100; touch uses legacy touchstart/touchend and never reads pressure or strike position
  implication: physical MIDI can be expressive, but the screen path is structurally incapable of soft/strong dynamics

- timestamp: 2026-08-12T23:24:00-03:00
  checked: calculateVelocityGain versus VelocityVisualizerManager.render
  found: the engine clamps velocities below minVel or above maxVel into the configured range, while both visualizer passes draw those same inputs as zero output
  implication: the displayed curve does not represent the audible transform, so users cannot reliably tune dynamics

- timestamp: 2026-08-12T23:27:00-03:00
  checked: baseline test command (`npm test`)
  found: PowerShell refused to load npm.ps1 because script execution is disabled; no project test ran
  implication: retry the identical package script via npm.cmd, which avoids the PowerShell wrapper without changing application behavior

- timestamp: 2026-08-12T23:30:00-03:00
  checked: unchanged baseline through `npm.cmd test`
  found: all 19 existing tests pass; the earlier failure was only the PowerShell script-policy wrapper
  implication: focused regressions can distinguish the reported MIDI/velocity defects from pre-existing test failures

- timestamp: 2026-08-12T23:30:00-03:00
  checked: default WebMIDI device routing and device state lifecycle
  found: newly connected devices are assigned by connection order (the first is forced to MIDI channel 1), `all` is the only mapping that preserves each message's embedded channel, and device routing/active Maps are not persisted; rebuilding the device list can also reattach a disabled input
  implication: the UI label and default/persistence behavior conflict with native multi-channel input and require either focused correction or explicit follow-up if outside the bounded core fix

- timestamp: 2026-08-12T23:30:00-03:00
  checked: preset/setlist serialization and held-note lifecycle
  found: preset state omits channel velocity settings, setlist snapshots omit both assigned MIDI channel and velocity settings, and physical/screen note-off paths recompute routing or selection instead of releasing the exact destinations activated at note-on
  implication: routing/dynamics can be lost after reload and route/octave changes while held can strand voices; destination identity must be captured at note-on

- timestamp: 2026-08-12T23:30:00-03:00
  checked: VST3 processor MIDI path
  found: `vst3/Source/PluginProcessor.cpp::processBlock` ignores `midiMessages` and only clears output
  implication: this Browser/Electron WebMIDI repair cannot claim VST3 MIDI support; VST3 remains a separate architecture gap

- timestamp: 2026-08-12T23:51:00-03:00
  checked: focused MIDI, velocity, screen-input, persistence, and device-lifecycle regressions after the proportional fixes
  found: all 16 focused contracts pass, including velocity-zero Note On as Note Off, multiple velocity listeners, route capture across remapping, and note release on device disable/disconnect
  implication: every isolated Browser/Electron defect identified by this investigation has automated regression coverage

- timestamp: 2026-08-12T23:51:00-03:00
  checked: complete automated suite with the real GeneralUser-GS SoundFont fixture
  found: 39 of 39 tests pass with no skipped real-bank checks; JavaScript syntax checks and `git diff --check` also pass
  implication: the routing/dynamics repairs integrate with the existing SF2 engine and persistence paths without an observed automated regression

- timestamp: 2026-08-12T23:51:00-03:00
  checked: repeated MIDI, velocity, and device stability run
  found: 20 of 20 repeated checks pass
  implication: automated behavior is stable enough to advance to physical controller and touch/pen verification

- timestamp: 2026-08-12T23:51:00-03:00
  checked: final read-only contract audit of SynthEngine, WebMidiManager, virtual piano/QWERTY input, velocity visualizers, mixer audition, and state serializers
  found: the implementation consistently separates incoming MIDI channels from internal tracks, applies effective velocity to SF2 zone selection and gain, captures release identities, preserves native device channels and preferences, routes CC7/pitch bend, and keeps visualizers and saved state aligned
  implication: no Browser/Electron contract blocker remains; real hardware, pressure/position feel, and audible dynamics require human verification

## Resolution

root_cause: MIDI input channels were conflated with internal track numbers, routing/control/note-off paths did not share captured destinations, screen input discarded strike dynamics, and velocity curves were applied inconsistently across gain, SF2 zones, visualizers, and persisted state.
fix: Added explicit MIDI-to-track resolution and direct-track audition, captured held-note/device routes, routed CC7 and pitch bend, preserved device preferences/native channels, implemented pointer dynamics and stable held identities, unified effective velocity for SF2 layers/gain/visualizers, supported multiple visualizer listeners and velocity-zero Note Off, and persisted per-track routing/dynamics.
verification: Automated Browser/Electron verification is green (focused 16/16, complete real-GeneralUser-GS suite 39/39, repeated stability 20/20, JavaScript syntax and diff checks clean); awaiting physical WebMIDI and touch/pen/audio verification. VST3 MIDI remains unsupported because its processor ignores incoming MIDI messages.
files_changed: [js/synth-engine.js, js/web-midi.js, js/performance-input.js, js/app.js, js/mixer.js, js/velocity-visualizer.js, js/preset-manager.js, js/setlist-manager.js, js/settings-modal.js, index.html, sw.js, package.json, test/midi-velocity-regressions.test.js, test/state-persistence-regressions.test.js]
