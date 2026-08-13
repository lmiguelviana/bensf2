const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => { writes.push([key, String(value)]); values.set(key, String(value)); }
  };
}

function makeOption() {
  return { value: '', textContent: '', selected: false, disabled: false };
}

function makeSelect(value = '') {
  return {
    value,
    disabled: false,
    title: '',
    children: [],
    attributes: new Map(),
    get options() { return this.children; },
    replaceChildren(...children) {
      this.children = children;
      if (children.length > 0) this.value = children.find(option => option.selected)?.value ?? children[0].value;
    },
    appendChild(option) {
      this.children.push(option);
      if (this.children.length === 1 || option.selected) this.value = option.value;
      return option;
    },
    setAttribute(name, valueToSet) { this.attributes.set(name, valueToSet); }
  };
}

function loadBrowserClass(file, globalName, overrides = {}) {
  const sandbox = {
    window: {},
    console,
    document: {
      createElement: tagName => tagName === 'option' ? makeOption() : {},
      getElementById: () => null,
      documentElement: { setAttribute() {} }
    },
    navigator: {},
    localStorage: makeStorage(),
    alert() {},
    ...overrides
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, file), 'utf8'), sandbox);
  return { Class: sandbox.window[globalName], sandbox };
}

test('audio output enumeration never requests microphone permission', async () => {
  let microphoneRequests = 0;
  const storage = makeStorage({ bensf2_audioOutput: 'usb-output' });
  const { Class: SettingsModalManager } = loadBrowserClass('js/settings-modal.js', 'SettingsModalManager', {
    localStorage: storage,
    navigator: {
      mediaDevices: {
        getUserMedia: async () => { microphoneRequests++; throw new Error('must not be called'); },
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
          { kind: 'audiooutput', deviceId: 'default', label: 'System Default' },
          { kind: 'audiooutput', deviceId: 'usb-output', label: '<USB Piano & Monitor>' }
        ]
      }
    }
  });
  const manager = new SettingsModalManager({}, {}, {});
  manager.audioOutputSelect = makeSelect();

  await manager.populateAudioOutputDevices();

  assert.equal(microphoneRequests, 0);
  assert.deepEqual(manager.audioOutputSelect.options.map(option => option.value), ['default', 'usb-output']);
  assert.equal(manager.audioOutputSelect.value, 'usb-output');
  assert.match(manager.audioOutputSelect.options[1].textContent, /<USB Piano & Monitor>/);
});

test('sample rate and buffer controls expose real platform-managed status instead of placebo choices', () => {
  const { Class: SettingsModalManager } = loadBrowserClass('js/settings-modal.js', 'SettingsModalManager');
  const manager = new SettingsModalManager({ ctx: { sampleRate: 48000 } }, {}, {});
  manager.sampleRateSelect = makeSelect();
  manager.bufferSizeSelect = makeSelect();

  manager.configurePlatformManagedAudioControls();

  assert.equal(manager.sampleRateSelect.disabled, true);
  assert.equal(manager.sampleRateSelect.options.length, 1);
  assert.equal(manager.sampleRateSelect.value, '48000');
  assert.equal(manager.sampleRateSelect.attributes.get('aria-disabled'), 'true');
  assert.equal(manager.bufferSizeSelect.disabled, true);
  assert.equal(manager.bufferSizeSelect.options.length, 1);
  assert.equal(manager.bufferSizeSelect.value, 'system');
});

test('failed output switching keeps settings open and does not persist or partially apply them', async () => {
  const storage = makeStorage();
  const notifications = [];
  const { Class: SettingsModalManager, sandbox } = loadBrowserClass('js/settings-modal.js', 'SettingsModalManager', {
    localStorage: storage
  });
  sandbox.window.showToastNotification = (...args) => notifications.push(args);
  const synthCalls = [];
  const manager = new SettingsModalManager({
    ctx: { setSinkId: async () => { throw new Error('device unavailable'); }, state: 'running' }
  }, {}, {
    setMaxPolyphony: value => synthCalls.push(['polyphony', value]),
    setVelocityCurve: value => synthCalls.push(['velocity', value])
  });
  manager.audioOutputSelect = makeSelect('missing-device');
  manager.audioOutputSelect.value = 'missing-device';
  manager.modalPolyphonySelect = makeSelect('128');
  manager.modalPolyphonySelect.value = '128';
  manager.modalVelocityCurveSelect = makeSelect('soft');
  manager.modalVelocityCurveSelect.value = 'soft';
  manager.btnSave = { disabled: false };
  let closeCalls = 0;
  manager.closeModal = () => { closeCalls++; };

  assert.equal(await manager.applySettings(), false);
  assert.equal(storage.writes.length, 0);
  assert.deepEqual(synthCalls, []);
  assert.equal(closeCalls, 0);
  assert.equal(manager.btnSave.disabled, false);
  assert.equal(notifications.at(-1)[2], 'warning');
});

test('successful output switching is awaited before persistence and success UI', async () => {
  const events = [];
  const storage = makeStorage();
  const originalSetItem = storage.setItem;
  storage.setItem = (...args) => { events.push('persist'); originalSetItem(...args); };
  const { Class: SettingsModalManager, sandbox } = loadBrowserClass('js/settings-modal.js', 'SettingsModalManager', {
    localStorage: storage
  });
  sandbox.window.showToastNotification = (...args) => events.push(args[2]);
  const ctx = {
    state: 'suspended',
    async setSinkId() { events.push('sink-start'); await Promise.resolve(); events.push('sink-done'); },
    async resume() { events.push('resume'); this.state = 'running'; }
  };
  const manager = new SettingsModalManager({ ctx }, {}, {
    setMaxPolyphony: () => events.push('polyphony'),
    setVelocityCurve: () => events.push('velocity')
  });
  manager.audioOutputSelect = makeSelect('usb');
  manager.audioOutputSelect.value = 'usb';
  manager.modalPolyphonySelect = makeSelect('64');
  manager.modalVelocityCurveSelect = makeSelect('hard');
  manager.closeModal = () => events.push('close');

  assert.equal(await manager.applySettings(), true);
  assert.deepEqual(events.slice(0, 4), ['sink-start', 'sink-done', 'resume', 'persist']);
  assert.ok(events.indexOf('close') > events.indexOf('velocity'));
  assert.equal(events.at(-1), 'success');
});

test('velocity database exposes readiness and preserves memory when IPC persistence fails', async () => {
  let allowSave = true;
  const { Class: BenDatabaseManager, sandbox } = loadBrowserClass('js/database.js', 'BenDatabaseManager');
  sandbox.window.electronAPI = {
    dbGetVelocityCurves: async () => [{
      id: 'custom_imported', name: '<Imported>', minVel: -5, maxVel: 999,
      curvePower: 99, mode: 'custom', fixedVel: 0, isFactory: false
    }],
    dbSaveVelocityCurves: async () => allowSave
  };
  const manager = new BenDatabaseManager();
  assert.equal(manager.getVelocityCurves().filter(curve => curve.isFactory).length, 6, 'factory curves are immediately usable');
  await manager.ready;

  const imported = manager.getVelocityCurves().find(curve => curve.id === 'custom_imported');
  assert.ok(imported);
  assert.equal(imported.minVel, 1);
  assert.equal(imported.maxVel, 127);
  assert.equal(imported.curvePower, 8);
  assert.equal(imported.fixedVel, 1);

  allowSave = false;
  const before = manager.getVelocityCurves();
  const result = await manager.addCustomVelocityCurve({ name: 'Will Fail', minVel: 1, maxVel: 127 });
  assert.equal(result, null);
  assert.equal(manager.getVelocityCurves(), before, 'failed persistence must not replace in-memory state');
  assert.equal(manager.getVelocityCurves().some(curve => curve.name === 'Will Fail'), false);
});
