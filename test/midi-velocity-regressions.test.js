const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function loadBrowserClass(file, globalName, extraGlobals = {}) {
  const sandbox = {
    window: {},
    console,
    Math,
    Map,
    Set,
    Uint8Array,
    setTimeout,
    clearTimeout,
    ...extraGlobals
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, file), 'utf8'), sandbox);
  return sandbox.window[globalName];
}

function audioParam(value = 0) {
  return {
    value,
    setValueAtTime(next) { this.value = next; },
    setTargetAtTime(next) { this.value = next; },
    linearRampToValueAtTime(next) { this.value = next; },
    cancelScheduledValues() {}
  };
}

function createSynthHarness(options = {}) {
  const sources = [];
  const buffers = [];
  const gains = [];
  const oscillators = [];
  const filters = [];
  const context = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => {
      const gain = { gain: audioParam(1), connect() {}, disconnect() {} };
      gains.push(gain);
      return gain;
    },
    createStereoPanner: () => ({
      pan: audioParam(0),
      connect() {},
      disconnect() {}
    }),
    createBuffer: () => {
      const buffer = {
        testId: buffers.length,
        getChannelData: () => new Float32Array(64)
      };
      buffers.push(buffer);
      return buffer;
    },
    createBufferSource: () => {
      const source = {
        playbackRate: audioParam(1),
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        buffer: null,
        onended: null,
        connect() {},
        disconnect() {},
        start() {},
        stop(...args) { this.stopArgs = args; },
        detune: audioParam(0)
      };
      sources.push(source);
      return source;
    },
    ...(options.withModulation ? {
      createOscillator: () => {
        const oscillator = {
          frequency: audioParam(0),
          connect() {},
          disconnect() {},
          start() {},
          stop() {}
        };
        oscillators.push(oscillator);
        return oscillator;
      }
    } : {}),
    ...(options.withFilter ? {
      createBiquadFilter: () => {
        const filter = {
          type: '',
          frequency: audioParam(0),
          Q: audioParam(0),
          connect() {},
          disconnect() {}
        };
        filters.push(filter);
        return filter;
      }
    } : {})
  };
  const audioEngine = {
    ctx: context,
    masterGain: {},
    init: () => context,
    resume() {},
    getCurrentTime: () => context.currentTime
  };
  const SynthEngine = loadBrowserClass('js/synth-engine.js', 'SynthEngine', {
    navigator: { userAgent: 'node-test' }
  });
  return { synth: new SynthEngine(audioEngine), sources, gains, oscillators, filters, context };
}

function loadVelocityLayerBank(synth) {
  synth.loadSoundFont({
    sampleData: new Int16Array(128),
    sampleHeaders: [0, 1].map((index) => ({
      start: index * 64,
      end: (index + 1) * 64,
      startLoop: index * 64,
      endLoop: index * 64,
      sampleRate: 44100,
      originalPitch: 60,
      fineTuningSemitones: 0
    })),
    presets: [{
      sampleIndices: [0, 1],
      zones: [
        { sampleIndex: 0, keyLow: 0, keyHigh: 127, velLow: 1, velHigh: 63, rootKey: 60 },
        { sampleIndex: 1, keyLow: 0, keyHigh: 127, velLow: 64, velHigh: 127, rootKey: 60 }
      ]
    }]
  });
}

test('an explicit MIDI assignment is not bypassed by the internal track number', () => {
  const { synth, sources } = createSynthHarness();
  loadVelocityLayerBank(synth);
  synth.channels[1].assignedPresetIndex = null;
  synth.channels[2].assignedPresetIndex = 0;
  synth.channels[2].assignedMidiChannel = 5;

  synth.noteOn(60, 100, 2);
  assert.equal(sources.length, 0, 'MIDI channel 2 must not trigger a track assigned to MIDI 5');

  synth.noteOn(60, 100, 5);
  assert.equal(sources.length, 1);
  assert.equal(Array.from(synth.activeVoices.values())[0].channel, 2);
});

test('note off releases the destinations captured at note on even after routing changes', () => {
  const { synth } = createSynthHarness();
  loadVelocityLayerBank(synth);
  synth.channels[1].assignedPresetIndex = null;
  synth.channels[2].assignedPresetIndex = 0;
  synth.channels[2].assignedMidiChannel = 5;

  synth.noteOn(60, 100, 5);
  const voice = Array.from(synth.activeVoices.values())[0];
  synth.channels[2].assignedMidiChannel = 6;
  synth.noteOff(60, 5);

  assert.equal(voice.isReleasing, true);
});

test('direct track audition ignores the external MIDI assignment', () => {
  const { synth, sources } = createSynthHarness();
  loadVelocityLayerBank(synth);
  synth.channels[1].assignedPresetIndex = null;
  synth.channels[2].assignedPresetIndex = 0;
  synth.channels[2].assignedMidiChannel = 9;

  synth.noteOnTrack(60, 80, 2);
  assert.equal(sources.length, 1);
  assert.equal(Array.from(synth.activeVoices.values())[0].channel, 2);
  synth.noteOffTrack(60, 2);
  assert.equal(Array.from(synth.activeVoices.values())[0].isReleasing, true);
});

test('normal velocity is expressive and fixed velocity also selects the matching SF2 layer', () => {
  const { synth, sources } = createSynthHarness();
  loadVelocityLayerBank(synth);

  assert.equal(synth.calculateEffectiveVelocity(20, 1), 20);
  assert.equal(synth.calculateEffectiveVelocity(120, 1), 120);
  assert.ok(synth.calculateVelocityGain(120, 1) > synth.calculateVelocityGain(20, 1) * 20);

  synth.globalVelocitySettings.mode = 'fixed';
  synth.globalVelocitySettings.fixedVel = 120;
  synth.noteOn(60, 20, 1);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].buffer.testId, 1, 'fixed velocity 120 must choose the loud SF2 layer');
});

test('a zero-velocity note-on behaves as note-off and never creates a voice', () => {
  const { synth, sources } = createSynthHarness();
  loadVelocityLayerBank(synth);
  synth.noteOn(60, 100, 1);
  const voice = Array.from(synth.activeVoices.values())[0];

  synth.noteOn(60, 0, 1);

  assert.equal(sources.length, 1);
  assert.equal(voice.isReleasing, true);
});

test('velocity limits clamp the response instead of creating silent gaps', () => {
  const { synth } = createSynthHarness();
  synth.globalVelocitySettings.minVel = 20;
  synth.globalVelocitySettings.maxVel = 110;

  assert.equal(synth.calculateEffectiveVelocity(1, 1), 20);
  assert.equal(synth.calculateEffectiveVelocity(127, 1), 110);
});

test('multiple velocity visualizers can subscribe without replacing one another', () => {
  const { synth } = createSynthHarness();
  const first = [];
  const second = [];
  const removeFirst = synth.addVelocityListener((...args) => first.push(args));
  synth.addVelocityListener((...args) => second.push(args));

  synth.calculateVelocityGain(64, 1);
  removeFirst();
  synth.calculateVelocityGain(100, 1);

  assert.equal(first.length, 1);
  assert.equal(second.length, 2);
  assert.deepEqual(second.map((entry) => entry[1]), [64, 100]);
});

test('a newly connected MIDI device preserves the channel encoded in each message', () => {
  const calls = [];
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager({
    noteOn: (...args) => calls.push(args),
    noteOff() {}
  });
  const input = { id: 'keyboard-a', name: 'Keyboard A', state: 'connected', onmidimessage: null };
  manager.handleMidiSuccess({ inputs: new Map([[input.id, input]]), onstatechange: null });

  assert.equal(manager.deviceChannelMap.get(input.id), 'all');
  input.onmidimessage({ data: new Uint8Array([0x94, 60, 23]) });
  assert.deepEqual(calls.map((args) => args.slice(0, 3)), [[60, 23, 5]]);
  assert.equal(calls[0][4].sourceId, '["keyboard-a",5]');
});

test('CC7 and pitch bend resolve an incoming MIDI channel through track routing', () => {
  const volumeCalls = [];
  const bendCalls = [];
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager({
    setMidiChannelVolume: (...args) => volumeCalls.push(args),
    setMidiPitchBend: (...args) => bendCalls.push(args),
    setChannelVolume() { throw new Error('must not address an internal track directly'); },
    setPitchBend() { throw new Error('must not address an internal track directly'); }
  });
  manager.deviceChannelMap.set('keyboard-a', 'all');

  manager.handleMidiMessage({ data: new Uint8Array([0xb4, 7, 64]) }, 'keyboard-a');
  manager.handleMidiMessage({ data: new Uint8Array([0xe4, 0, 96]) }, 'keyboard-a');

  assert.deepEqual(volumeCalls, [[5, 64 / 127]]);
  assert.equal(bendCalls.length, 1);
  assert.equal(bendCalls[0][0], 5);
  assert.ok(Math.abs(bendCalls[0][1] - 1) < 1e-12);
});

test('routed channel controls affect only tracks listening to that MIDI channel', () => {
  const { synth } = createSynthHarness();
  synth.channels[1].assignedMidiChannel = 'all';
  synth.channels[2].assignedMidiChannel = 5;
  synth.channels[3].assignedMidiChannel = 6;

  synth.setMidiChannelVolume(5, 0.35);
  synth.setMidiPitchBend(5, 1.5);

  assert.equal(synth.channels[1].volume, 0.35);
  assert.equal(synth.channels[2].volume, 0.35);
  assert.equal(synth.channels[3].volume, 1);
  assert.equal(synth.pitchBendSemi.get(1), 1.5);
  assert.equal(synth.pitchBendSemi.get(2), 1.5);
  assert.equal(synth.pitchBendSemi.get(3), 0);
});

test('MIDI device routing and enabled state survive a manager restart', () => {
  const values = new Map();
  const localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager', { localStorage });
  const manager = new WebMidiManager({});
  manager.setDeviceChannelMapping('keyboard-a', 7);
  manager.setDeviceActive('keyboard-a', false);

  const restored = new WebMidiManager({});
  assert.equal(restored.deviceChannelMap.get('keyboard-a'), 7);
  assert.equal(restored.deviceActiveMap.get('keyboard-a'), false);
});

test('note off keeps the note-on route when a device is remapped while held', () => {
  const noteOnCalls = [];
  const noteOffCalls = [];
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager({
    noteOn: (...args) => noteOnCalls.push(args),
    noteOff: (...args) => noteOffCalls.push(args)
  });
  manager.setDeviceChannelMapping('keyboard-a', 5);
  manager.handleMidiMessage({ data: new Uint8Array([0x90, 60, 100]) }, 'keyboard-a');
  manager.setDeviceChannelMapping('keyboard-a', 6);
  manager.handleMidiMessage({ data: new Uint8Array([0x80, 60, 0]) }, 'keyboard-a');

  assert.deepEqual(noteOnCalls.map((args) => args.slice(0, 3)), [[60, 100, 5]]);
  assert.deepEqual(noteOffCalls.map((args) => args.slice(0, 2)), [[60, 5]]);
  assert.equal(noteOffCalls[0][3].ownerId, noteOnCalls[0][4].ownerId);
  assert.equal(manager.activeNoteRoutes.size, 0);
});

test('disabling or disconnecting a MIDI device releases all notes it owns', () => {
  const noteOffCalls = [];
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager({
    noteOn() {},
    noteOff: (...args) => noteOffCalls.push(args)
  });
  const input = { id: 'keyboard-a', name: 'Keyboard A', state: 'connected', onmidimessage: null };
  const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
  manager.handleMidiSuccess(access);
  input.onmidimessage({ data: new Uint8Array([0x90, 61, 80]) });
  manager.setDeviceActive(input.id, false);
  assert.deepEqual(noteOffCalls.map((args) => args.slice(0, 2)), [[61, 1]]);

  manager.setDeviceActive(input.id, true);
  input.onmidimessage({ data: new Uint8Array([0x91, 62, 90]) });
  input.state = 'disconnected';
  manager.updateDeviceList();
  assert.deepEqual(noteOffCalls.map((args) => args.slice(0, 2)), [[61, 1], [62, 2]]);
  assert.equal(manager.activeNoteRoutes.size, 0);
});

test('refreshing the MIDI device list does not re-enable a disabled input', () => {
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager({});
  const input = { id: 'keyboard-a', name: 'Keyboard A', state: 'connected', onmidimessage: null };
  manager.handleMidiSuccess({ inputs: new Map([[input.id, input]]), onstatechange: null });
  manager.setDeviceActive(input.id, false);
  manager.updateDeviceList();

  assert.equal(input.onmidimessage, null);
});

test('CC64 sustains only its device/channel source and releases deferred notes on pedal-up', () => {
  const calls = [];
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager({
    noteOn: (...args) => calls.push(['on', ...args]),
    noteOff: (...args) => calls.push(['off', ...args])
  });

  manager.handleMidiMessage({ data: new Uint8Array([0x90, 60, 100]) }, 'keyboard-a');
  manager.handleMidiMessage({ data: new Uint8Array([0xb0, 64, 127]) }, 'keyboard-a');
  manager.handleMidiMessage({ data: new Uint8Array([0x80, 60, 0]) }, 'keyboard-a');
  manager.handleMidiMessage({ data: new Uint8Array([0x90, 60, 100]) }, 'keyboard-b');
  manager.handleMidiMessage({ data: new Uint8Array([0x80, 60, 0]) }, 'keyboard-b');

  assert.equal(calls.filter(([type]) => type === 'off').length, 1,
    'keyboard B releases while keyboard A remains sustained');
  manager.handleMidiMessage({ data: new Uint8Array([0xb0, 64, 0]) }, 'keyboard-a');
  assert.equal(calls.filter(([type]) => type === 'off').length, 2);
  const noteOnCalls = calls.filter(([type]) => type === 'on');
  assert.notEqual(noteOnCalls[0][5].ownerId, noteOnCalls[1][5].ownerId);
});

test('sustain source remains releasable after destination remapping', () => {
  const noteOffCalls = [];
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager({
    noteOn() {},
    noteOff: (...args) => noteOffCalls.push(args)
  });
  manager.setDeviceChannelMapping('keyboard-a', 5);
  manager.handleMidiMessage({ data: new Uint8Array([0x90, 60, 100]) }, 'keyboard-a');
  manager.handleMidiMessage({ data: new Uint8Array([0xb0, 64, 127]) }, 'keyboard-a');
  manager.handleMidiMessage({ data: new Uint8Array([0x80, 60, 0]) }, 'keyboard-a');
  manager.setDeviceChannelMapping('keyboard-a', 6);
  manager.handleMidiMessage({ data: new Uint8Array([0xb0, 64, 0]) }, 'keyboard-a');

  assert.equal(noteOffCalls.length, 1);
  assert.equal(noteOffCalls[0][1], 5, 'the captured note-on destination is preserved');
});

test('source-scoped expression continues to affect held notes after remapping', () => {
  const { synth } = createSynthHarness();
  loadVelocityLayerBank(synth);
  synth.channels[1].assignedPresetIndex = null;
  synth.channels[5].assignedPresetIndex = 0;
  synth.channels[5].assignedMidiChannel = 5;
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager(synth);
  manager.setDeviceChannelMapping('keyboard-a', 5);
  manager.handleMidiMessage({ data: new Uint8Array([0x90, 60, 100]) }, 'keyboard-a');
  const voice = Array.from(synth.activeVoices.values())[0];
  manager.setDeviceChannelMapping('keyboard-a', 6);
  manager.handleMidiMessage({ data: new Uint8Array([0xe0, 0, 96]) }, 'keyboard-a');
  assert.ok(Math.abs(voice.sourceNode.playbackRate.value - voice.basePlaybackRate * Math.pow(2, 1 / 12)) < 1e-12);
});

test('MIDI Learn CC mappings can be scoped by device and source channel', () => {
  const calls = [];
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager({});
  manager.addCcMapping(74, (_value, metadata) => calls.push(metadata), {
    deviceId: 'keyboard-a',
    channel: 2
  });

  manager.handleMidiMessage({ data: new Uint8Array([0xb1, 74, 64]) }, 'keyboard-a');
  manager.handleMidiMessage({ data: new Uint8Array([0xb1, 74, 64]) }, 'keyboard-b');
  manager.handleMidiMessage({ data: new Uint8Array([0xb2, 74, 64]) }, 'keyboard-a');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].deviceId, 'keyboard-a');
  assert.equal(calls[0].channel, 2);
  assert.equal(calls[0].cc, 74);
});

test('two devices playing the same note own independent synth voices', () => {
  const { synth } = createSynthHarness();
  loadVelocityLayerBank(synth);
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager(synth);

  manager.handleMidiMessage({ data: new Uint8Array([0x90, 60, 100]) }, 'keyboard-a');
  manager.handleMidiMessage({ data: new Uint8Array([0x90, 60, 100]) }, 'keyboard-b');
  assert.equal(synth.activeVoices.size, 2);
  const ownerIds = Array.from(synth.activeVoices.values(), (voice) => voice.ownerId);
  assert.equal(new Set(ownerIds).size, 2);

  manager.handleMidiMessage({ data: new Uint8Array([0x80, 60, 0]) }, 'keyboard-a');
  const voices = Array.from(synth.activeVoices.values());
  assert.equal(voices.filter((voice) => voice.isReleasing).length, 1);
  assert.equal(voices.filter((voice) => !voice.isReleasing).length, 1);
});

test('device-scoped pitch bend on an omni track does not affect another device or MIDI channel', () => {
  const { synth } = createSynthHarness();
  loadVelocityLayerBank(synth);
  synth.channels[1].assignedMidiChannel = 'all';
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager(synth);

  manager.handleMidiMessage({ data: new Uint8Array([0x90, 60, 100]) }, 'keyboard-a');
  manager.handleMidiMessage({ data: new Uint8Array([0x91, 62, 100]) }, 'keyboard-b');
  const voices = Array.from(synth.activeVoices.values());
  manager.handleMidiMessage({ data: new Uint8Array([0xe0, 0, 96]) }, 'keyboard-a');

  assert.ok(Math.abs(voices[0].sourceNode.playbackRate.value - voices[0].basePlaybackRate * Math.pow(2, 1 / 12)) < 1e-12);
  assert.equal(voices[1].sourceNode.playbackRate.value, voices[1].basePlaybackRate);
});

test('CC1 drives the documented vibrato destination per MIDI source', () => {
  const { synth, oscillators } = createSynthHarness({ withModulation: true });
  loadVelocityLayerBank(synth);
  const WebMidiManager = loadBrowserClass('js/web-midi.js', 'WebMidiManager');
  const manager = new WebMidiManager(synth);

  manager.handleMidiMessage({ data: new Uint8Array([0x90, 60, 100]) }, 'keyboard-a');
  manager.handleMidiMessage({ data: new Uint8Array([0xb0, 1, 127]) }, 'keyboard-a');
  const voice = Array.from(synth.activeVoices.values())[0];
  assert.equal(oscillators.length, 1);
  assert.equal(oscillators[0].frequency.value, 5);
  assert.equal(voice.modulationGainNode.gain.value, 50);
});

test('channel volume changes preserve mute and solo suppression', () => {
  const { synth } = createSynthHarness();
  synth.setChannelMute(1, true);
  synth.setChannelVolume(1, 0.7);
  assert.equal(synth.channels[1].gainNode.gain.value, 0);
  assert.equal(synth.channels[1].volume, 0.7);

  synth.setChannelMute(1, false);
  synth.setChannelSoloSuppressed(1, true);
  synth.setChannelVolume(1, 0.4);
  assert.equal(synth.channels[1].gainNode.gain.value, 0);
  synth.setChannelSoloSuppressed(1, false);
  assert.equal(synth.channels[1].gainNode.gain.value, 0.4);
});

test('screen velocity uses pressure when available and vertical strike position otherwise', () => {
  const PerformanceInput = loadBrowserClass('js/performance-input.js', 'PerformanceInput');
  const rect = { top: 100, height: 200 };

  const softPressure = PerformanceInput.pointerVelocity(
    { pointerType: 'pen', pressure: 0.15, clientY: 290 },
    rect
  );
  const hardPressure = PerformanceInput.pointerVelocity(
    { pointerType: 'pen', pressure: 0.9, clientY: 110 },
    rect
  );
  assert.ok(hardPressure > softPressure);

  const unsupportedSoft = PerformanceInput.pointerVelocity(
    { pointerType: 'touch', pressure: 0.5, clientY: 110 },
    rect
  );
  const unsupportedHard = PerformanceInput.pointerVelocity(
    { pointerType: 'touch', pressure: 0.5, clientY: 290 },
    rect
  );
  assert.ok(unsupportedHard > unsupportedSoft);
  assert.ok(unsupportedSoft >= 1 && unsupportedHard <= 127);
});

test('the virtual piano uses Pointer Events and never sends a fixed velocity of 100', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'js/app.js'), 'utf8');
  assert.match(source, /addEventListener\('pointerdown'/);
  assert.match(source, /PerformanceInput\.pointerVelocity/);
  assert.doesNotMatch(source, /synth\.noteOn\(noteNum,\s*100,\s*activeCh\)/);
});
