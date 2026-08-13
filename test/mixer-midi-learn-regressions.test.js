const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function loadBrowserClass(file, globalName, overrides = {}) {
  const sandbox = {
    window: {},
    console,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      createElement: () => ({})
    },
    ...overrides
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, file), 'utf8'), sandbox);
  return { Class: sandbox.window[globalName], sandbox };
}

function makeChannels() {
  const channels = {};
  for (let channel = 1; channel <= 16; channel++) {
    channels[channel] = {
      name: `Track ${channel}`,
      volume: channel / 20,
      pan: 0,
      muted: false,
      userMuted: false,
      solo: false,
      transpose: 0,
      semitoneTranspose: 0,
      assignedPresetIndex: channel - 1,
      assignedMidiChannel: channel,
      keyRangeLow: 0,
      keyRangeHigh: 127,
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 },
      velocitySettings: { useGlobal: true, mode: 'normal' },
      gainNode: { disconnect() {} }
    };
  }
  return channels;
}

function createMixerHarness(MixerConsoleManager) {
  const channels = makeChannels();
  const muteCalls = [];
  const synth = {
    channels,
    stopAllVoicesCalls: 0,
    stopAllVoices() { this.stopAllVoicesCalls++; },
    setChannelName(ch, value) { channels[ch].name = value; },
    setChannelVolume(ch, value) { channels[ch].volume = value; },
    setChannelPan(ch, value) { channels[ch].pan = value; },
    setChannelPreset(ch, value) { channels[ch].assignedPresetIndex = value; },
    setChannelMute(ch, value) { channels[ch].muted = value; muteCalls.push([ch, value]); }
  };
  const mixer = new MixerConsoleManager(synth, null);
  mixer.totalChannels = 4;
  mixer.renderMixer = () => {};
  return { mixer, synth, channels, muteCalls };
}

test('solo suppression never overwrites the user mute intention', () => {
  const { Class: MixerConsoleManager } = loadBrowserClass('js/mixer.js', 'MixerConsoleManager');
  const { mixer, channels } = createMixerHarness(MixerConsoleManager);

  mixer.setChannelUserMute(2, false);
  mixer.handleSoloToggle(1, true);
  assert.equal(channels[2].muted, true, 'another visible track is effectively silent during solo');
  assert.equal(mixer.getChannelUserMuted(2), false, 'solo does not turn effective mute into user mute');

  mixer.handleSoloToggle(1, false);
  assert.equal(channels[2].muted, false, 'ending solo restores the original audibility');

  mixer.setChannelUserMute(2, true);
  mixer.handleSoloToggle(1, true);
  mixer.handleSoloToggle(1, false);
  assert.equal(channels[2].muted, true, 'a user mute survives a solo cycle');
  assert.equal(mixer.getChannelUserMuted(2), true);
});

test('hidden channels are silenced and become audible again when made visible', () => {
  const { Class: MixerConsoleManager } = loadBrowserClass('js/mixer.js', 'MixerConsoleManager');
  const { mixer, channels } = createMixerHarness(MixerConsoleManager);

  mixer.setVisibleChannelCount(2, false);
  assert.equal(channels[3].visibilitySuppressed, true);
  assert.equal(channels[3].muted, true);
  assert.equal(mixer.getChannelUserMuted(3), false);

  mixer.setVisibleChannelCount(3, false);
  assert.equal(channels[3].visibilitySuppressed, false);
  assert.equal(channels[3].muted, false);
});

test('removing a middle track shifts logical channel and FX state and resets the tail', () => {
  const { Class: MixerConsoleManager } = loadBrowserClass('js/mixer.js', 'MixerConsoleManager');
  const { mixer, synth, channels } = createMixerHarness(MixerConsoleManager);
  const fx = new Map(Array.from({ length: 16 }, (_, index) => [index + 1, { marker: `fx-${index + 1}` }]));
  mixer.fxRack = {
    selected: 1,
    getTrackState: ch => ({ ...fx.get(ch) }),
    applyTrackState: (ch, state) => fx.set(ch, { ...state }),
    resetTrackState: ch => fx.set(ch, { marker: 'reset' }),
    setSelectedChannel(ch) { this.selected = ch; }
  };
  const removedBindings = [];
  mixer.midiLearn = { removeBindingsForChannel: ch => removedBindings.push(ch) };
  mixer.selectedChannel = 4;

  mixer.removeChannel(2);

  assert.equal(mixer.totalChannels, 3);
  assert.equal(channels[2].name, 'Track 3');
  assert.equal(channels[2].assignedPresetIndex, 2);
  assert.equal(channels[3].name, 'Track 4');
  assert.equal(channels[4].assignedPresetIndex, null);
  assert.equal(fx.get(2).marker, 'fx-3');
  assert.equal(fx.get(3).marker, 'fx-4');
  assert.equal(fx.get(4).marker, 'reset');
  assert.equal(mixer.selectedChannel, 3);
  assert.equal(synth.stopAllVoicesCalls, 1);
  assert.deepEqual(removedBindings, [2, 3, 4]);
});

test('mixer rerender releases analyser graph connections before replacing them', () => {
  const { Class: MixerConsoleManager } = loadBrowserClass('js/mixer.js', 'MixerConsoleManager');
  const { mixer, channels } = createMixerHarness(MixerConsoleManager);
  const disconnected = [];
  channels[1].gainNode.disconnect = node => disconnected.push(['gain', node]);
  const analyser = { disconnect: () => disconnected.push(['analyser']) };
  mixer.vuMeter = {
    analysers: new Map([['ch_1', analyser], ['master', {}]]),
    canvases: new Map([['ch_1', {}], ['master', {}]])
  };

  mixer.releaseMixerAnalysers();

  assert.deepEqual(disconnected, [['gain', analyser], ['analyser']]);
  assert.equal(mixer.vuMeter.analysers.has('ch_1'), false);
  assert.equal(mixer.vuMeter.analysers.has('master'), true);
});

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...items) => items.forEach(item => values.add(item)),
    remove: (...items) => items.forEach(item => values.delete(item)),
    contains: item => values.has(item),
    [Symbol.iterator]: () => values[Symbol.iterator]()
  };
}

function makeElement({ tagName = 'INPUT', id = '', key = '', channel = '', classes = [] } = {}) {
  const listeners = new Map();
  return {
    id,
    tagName,
    dataset: { midiLearnKey: key, channel },
    classList: makeClassList(classes),
    min: '0',
    max: '100',
    value: '0',
    clicks: 0,
    listeners,
    click() { this.clicks++; },
    addEventListener(type, callback) { listeners.set(type, callback); },
    getBoundingClientRect() { return { left: 12, bottom: 34 }; }
  };
}

test('MIDI Learn remapping removes ghosts, toggles once per edge, and follows rerendered controls', () => {
  const { Class: MidiLearnManager } = loadBrowserClass('js/midi-learn.js', 'MidiLearnManager');
  const mappings = new Map();
  const removals = [];
  const webMidi = {
    addCcMapping: (cc, callback) => mappings.set(cc, callback),
    removeCcMapping: cc => { removals.push(cc); mappings.delete(cc); },
    cancelLearning() {},
    setLearningCallback() {}
  };
  const manager = new MidiLearnManager(webMidi);
  manager.learningOverlayEl = { style: {} };
  const first = makeElement({ tagName: 'BUTTON', key: 'ch_1_mute', classes: ['btn'] });
  manager.currentElement = first;
  manager.currentLabel = 'Mute';
  manager.currentCallback = () => { throw new Error('button callbacks must not execute after click'); };
  manager.completeLearning(10);

  mappings.get(10)(0.8);
  mappings.get(10)(0.9);
  mappings.get(10)(0.1);
  mappings.get(10)(0.8);
  assert.equal(first.clicks, 2, 'continuous high CC values should produce one click');

  manager.currentElement = first;
  manager.currentCallback = () => {};
  manager.completeLearning(11);
  assert.equal(mappings.has(10), false);
  assert.ok(removals.includes(10));

  const replacement = makeElement({ tagName: 'BUTTON', key: 'ch_1_mute', classes: ['btn'] });
  manager.attach(replacement, 'Mute rerendered', () => {});
  mappings.get(11)(0.8);
  assert.equal(first.clicks, 2);
  assert.equal(replacement.clicks, 1, 'the stable binding should point at the new DOM element');
});

test('MIDI Learn input changes invoke the bound callback exactly once', () => {
  const { Class: MidiLearnManager } = loadBrowserClass('js/midi-learn.js', 'MidiLearnManager');
  const mappings = new Map();
  const manager = new MidiLearnManager({
    addCcMapping: (cc, callback) => mappings.set(cc, callback),
    removeCcMapping: cc => mappings.delete(cc),
    cancelLearning() {},
    setLearningCallback() {}
  });
  manager.learningOverlayEl = { style: {} };
  const input = makeElement({ key: 'ch_1_volume' });
  const values = [];
  manager.currentElement = input;
  manager.currentLabel = 'Volume';
  manager.currentCallback = value => values.push(value);
  manager.completeLearning(7);

  mappings.get(7)(0.25);
  assert.deepEqual(values, [0.25]);
  assert.equal(Number(input.value), 25);
});

test('MIDI Learn is reachable with Shift+F10 and a touch long-press without triggering a normal click', async () => {
  const { Class: MidiLearnManager } = loadBrowserClass('js/midi-learn.js', 'MidiLearnManager', {
    setTimeout,
    clearTimeout
  });
  const manager = new MidiLearnManager({});
  manager.longPressDelayMs = 5;
  const shown = [];
  manager.showContextMenu = (x, y) => shown.push([x, y]);
  const element = makeElement({ tagName: 'BUTTON', key: 'ch_1_solo', classes: ['btn'] });
  manager.attach(element, 'Solo da pista', () => {});

  const keyboardEvent = {
    key: 'F10', shiftKey: true,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; }
  };
  element.listeners.get('keydown')(keyboardEvent);
  assert.deepEqual(shown[0], [12, 34]);
  assert.equal(manager.currentLabel, 'Solo da pista');
  assert.equal(keyboardEvent.prevented, true);

  element.listeners.get('pointerdown')({ pointerType: 'touch', clientX: 50, clientY: 60 });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(shown[1], [50, 60]);
  const clickEvent = {
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; }
  };
  element.listeners.get('click')(clickEvent);
  assert.equal(clickEvent.prevented, true);
  assert.equal(clickEvent.stopped, true);
});
