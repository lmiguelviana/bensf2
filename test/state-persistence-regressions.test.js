const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function createStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: key => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key)
  };
}

function loadBrowserClass(file, globalName, overrides = {}) {
  const sandbox = {
    window: {},
    console,
    document: {
      getElementById: () => null,
      createElement: tagName => ({
        tagName: tagName.toUpperCase(),
        appendChild() {},
        click() {},
        style: {}
      })
    },
    localStorage: createStorage(),
    confirm: () => false,
    setTimeout,
    clearTimeout,
    Blob: globalThis.Blob,
    URL: globalThis.URL,
    ...overrides
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, file), 'utf8'), sandbox);
  return { Class: sandbox.window[globalName], sandbox };
}

function channelState(overrides = {}) {
  return {
    name: 'Piano',
    volume: 0,
    pan: 0,
    muted: false,
    userMuted: false,
    solo: false,
    transpose: 0,
    semitoneTranspose: 0,
    keyRangeLow: 0,
    keyRangeHigh: 127,
    assignedMidiChannel: 7,
    assignedPresetIndex: 0,
    adsr: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 },
    velocitySettings: {
      useGlobal: false,
      mode: 'custom',
      minVel: 12,
      maxVel: 118,
      curvePower: 1.6,
      fixedVel: 95
    },
    ...overrides
  };
}

function createRigHarness(PresetManager) {
  const synth = {
    channels: { 1: channelState() },
    globalVelocitySettings: { mode: 'soft', minVel: 5, maxVel: 121, curvePower: 1.2, fixedVel: 100 },
    velocityCurve: 'soft',
    isAutoPolyphony: true,
    maxPolyphony: 64,
    parsedSf2Data: {
      presets: [{ name: 'Grand Piano', bank: 0, preset: 0, sf2Source: 'trusted.sf2' }]
    },
    setMaxPolyphony(value) { this.isAutoPolyphony = value === 'auto'; this.maxPolyphony = value; },
    setVelocityCurve(value) { this.velocityCurve = value; },
    setChannelName(ch, value) { this.channels[ch].name = value; },
    setChannelVolume(ch, value) { this.channels[ch].volume = value; },
    setChannelPan(ch, value) { this.channels[ch].pan = value; },
    setChannelMute(ch, value) { this.channels[ch].muted = value; },
    setChannelPreset(ch, value) { this.channels[ch].assignedPresetIndex = value; }
  };
  const fxRack = {
    reverbModes: { concert_hall: {}, room: {} },
    master: {
      eqEnabled: true, chorusEnabled: true, delayEnabled: false, reverbEnabled: true,
      eqLow: 1, eqMid: -2, eqHigh: 3, chorusRate: 1.7, chorusMix: 0.3,
      delayTime: 0.3, delayMix: 0.2, reverbSize: 0.4, reverbMix: 0.25,
      reverbMode: 'concert_hall'
    },
    tracks: new Map([[1, {
      cutoffEnabled: true, cutoffFreq: 9000, eqEnabled: true, chorusEnabled: false,
      delayEnabled: true, reverbEnabled: true, eqLow: 2, eqMid: 0, eqHigh: -1,
      chorusRate: 2.1, chorusMix: 0.4, delayTime: 0.45, delayMix: 0.35,
      reverbSize: 0.55, reverbMix: 0.2, reverbMode: 'room'
    }]]),
    getMasterState() { return { ...this.master }; },
    getTrackState(ch) { return { ...this.tracks.get(ch) }; },
    applyMasterState(value) { this.master = { ...value }; },
    applyTrackState(ch, value) { this.tracks.set(ch, { ...value }); },
    notifySelectionChange() {}
  };
  const mixer = {
    totalChannels: 1,
    getChannelUserMuted: ch => !!synth.channels[ch].userMuted,
    setChannelUserMute(ch, value) { synth.channels[ch].userMuted = value; },
    setVisibleChannelCount(value) { this.totalChannels = value; },
    applyAllChannelAudibility() {},
    renderMixer() {}
  };
  const manager = Object.create(PresetManager.prototype);
  Object.assign(manager, {
    synth,
    fxRack,
    mixer,
    userPresets: new Map(),
    activePresetName: null,
    updatePresetDropdownUI() {},
    notify() {}
  });
  return { manager, synth, fxRack, mixer };
}

test('preset schema round-trips routing, velocity, ADSR, mute, and canonical FX units', () => {
  const { Class: PresetManager } = loadBrowserClass('js/preset-manager.js', 'PresetManager');
  const { manager, synth, fxRack } = createRigHarness(PresetManager);

  const saved = manager.getCurrentState('Dynamics');
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.kind, 'bensf2-rig-state');
  assert.equal(saved.masterFx.reverbSize, 0.4);
  assert.equal(saved.masterFx.chorusMix, 0.3);
  assert.equal(saved.channels[1].trackFx.delayTime, 0.45);
  assert.equal(saved.channels[1].velocitySettings.curvePower, 1.6);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.channels[1].timbreInfo)), {
    name: 'Grand Piano', bank: 0, preset: 0, sf2Source: 'trusted.sf2'
  });

  synth.channels[1] = channelState({
    assignedMidiChannel: 'all',
    assignedPresetIndex: null,
    velocitySettings: { useGlobal: true, mode: 'normal' }
  });
  synth.globalVelocitySettings.mode = 'hard';
  fxRack.master.reverbSize = 0.99;

  assert.equal(manager.loadPreset(saved), true);
  assert.equal(synth.channels[1].assignedMidiChannel, 7);
  assert.equal(synth.channels[1].assignedPresetIndex, 0);
  assert.equal(synth.channels[1].velocitySettings.curvePower, 1.6);
  assert.equal(synth.globalVelocitySettings.mode, 'soft');
  assert.equal(fxRack.master.reverbSize, 0.4);
  assert.equal(fxRack.tracks.get(1).delayTime, 0.45);
});

test('legacy percent and millisecond FX values migrate once into normalized units', () => {
  const { Class: PresetManager } = loadBrowserClass('js/preset-manager.js', 'PresetManager');
  const { manager } = createRigHarness(PresetManager);
  const migrated = manager.normalizeRigState({
    name: 'Legacy',
    totalChannels: 1,
    channels: [{
      channel: 1,
      volume: 99,
      pan: -99,
      keyRangeLow: 120,
      keyRangeHigh: 20,
      trackFx: { chorusMix: 30, delayTime: 450, delayMix: 20, reverbSize: 55, reverbMix: 25 }
    }],
    masterFx: { chorusMix: 30, delayTime: 300, delayMix: 20, reverbSize: 40, reverbMix: 25 }
  });

  assert.equal(migrated.channels[1].volume, 1);
  assert.equal(migrated.channels[1].pan, -1);
  assert.equal(migrated.channels[1].keyRangeLow, 20);
  assert.equal(migrated.channels[1].keyRangeHigh, 120);
  assert.equal(migrated.masterFx.delayTime, 0.3);
  assert.equal(migrated.masterFx.reverbSize, 0.4);
  assert.equal(migrated.channels[1].trackFx.delayTime, 0.45);
  assert.equal(migrated.channels[1].trackFx.reverbSize, 0.55);
});

test('saving locally is separate from explicit Electron export capabilities', async () => {
  const storage = createStorage();
  const exportCalls = [];
  const { Class: PresetManager, sandbox } = loadBrowserClass('js/preset-manager.js', 'PresetManager', {
    localStorage: storage
  });
  sandbox.window.electronAPI = {
    savePresetFile: async (...args) => { exportCalls.push(args); return true; }
  };
  const { manager } = createRigHarness(PresetManager);
  manager.updatePresetDropdownUI = () => {};

  const saved = manager.createNewPreset('Local Only');
  assert.ok(saved);
  assert.equal(exportCalls.length, 0, 'saving in the app must not open a native export dialog');
  assert.ok(storage.getItem('sf2_user_presets'));

  assert.equal(await manager.exportPresetToJson(saved), true);
  assert.equal(exportCalls.length, 1);
  assert.equal(exportCalls[0][0], 'Local Only_preset.json');
  assert.match(exportCalls[0][1], /"schemaVersion": 2/);
});

test('setlists start empty and delegate complete snapshots transactionally', () => {
  const storage = createStorage();
  const { Class: BenSetlistManager } = loadBrowserClass('js/setlist-manager.js', 'BenSetlistManager', {
    localStorage: storage
  });
  const snapshot = { schemaVersion: 2, kind: 'bensf2-rig-state', name: 'Song', channels: { 1: channelState() } };
  const calls = [];
  const presetManager = {
    userPresets: new Map(),
    captureRigState(name) { calls.push(['capture', name]); return snapshot; },
    normalizeRigState(value) { return value; },
    applyRigState(value, options) { calls.push(['apply', value, options]); return { ok: true, state: value }; }
  };
  const manager = new BenSetlistManager({}, presetManager, { renderMixer() {} }, null);
  manager.renderSetlistPanel = () => {};
  manager.notify = () => {};

  assert.equal(manager.items.length, 0, 'no fake demo songs should be persisted');
  const item = manager.addItem('Real Song', '', '', true);
  assert.equal(item.snapshot, snapshot);
  assert.equal(manager.selectSong(0), true);
  assert.equal(manager.currentIndex, 0);
  assert.equal(calls.filter(call => call[0] === 'apply').length, 1);
});

test('setlist does not claim success or change selection when a linked preset is missing', () => {
  const { Class: BenSetlistManager } = loadBrowserClass('js/setlist-manager.js', 'BenSetlistManager');
  const notices = [];
  const manager = Object.create(BenSetlistManager.prototype);
  Object.assign(manager, {
    synth: {},
    presetManager: { userPresets: new Map() },
    mixer: null,
    items: [{ id: 'song_1', songName: 'Missing', presetName: 'Does Not Exist', notes: '', snapshot: null }],
    currentIndex: -1,
    notify: (...args) => notices.push(args),
    renderSetlistPanel() {}
  });

  assert.equal(manager.selectSong(0), false);
  assert.equal(manager.currentIndex, -1);
  assert.equal(notices.some(([, , type]) => type === 'success'), false);
  assert.equal(notices.some(([, , type]) => type === 'warning'), true);
});
