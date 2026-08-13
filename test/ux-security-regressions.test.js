const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function loadBrowserClass(file, className, extras = {}) {
  const context = { window: {}, console, ...extras };
  vm.runInNewContext(`${read(file)}\n;globalThis.__Exported = ${className};`, context, { filename: file });
  return { Class: context.__Exported, context };
}

test('the app shell exposes core navigation, dialogs, zoom, and emergency controls accessibly', () => {
  const html = read('index.html');
  assert.match(html, /Content-Security-Policy[^>]+script-src 'self'/);
  assert.match(html, /object-src 'none'/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /id="tabMixer"[^>]+role="tab"[^>]+aria-selected="true"/);
  assert.match(html, /role="dialog"[^>]+aria-modal="true"/);
  assert.match(html, /label[^>]+for="audioOutputSelect"/);
  assert.match(html, /id="sampleRateSelect"[^>]+disabled/);
  assert.match(html, /id="bufferSizeSelect"[^>]+disabled/);
  assert.match(html, /id="btnPanic"/);
  assert.match(html, /id="pianoKeys"[^>]+aria-label=/);
});

test('untrusted UI strings are built with textContent instead of app-level HTML interpolation', () => {
  const source = read('js/app.js');
  assert.doesNotMatch(source, /\.innerHTML\s*=|insertAdjacentHTML|\.outerHTML\s*=/);
  assert.match(source, /titleEl\.textContent = String\(title/);
  assert.match(source, /name\.textContent = String\(p\.name/);
  assert.match(source, /option\.textContent = name/);
});

test('Electron denies ambient privileges and exposes only atomic preset file capabilities', () => {
  const main = read('main.js');
  const preload = read('preload.js');
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /will-navigate/);
  assert.match(main, /permission === 'midi'/);
  assert.match(main, /assertTrustedIpc\(event\)/);
  assert.doesNotMatch(main, /ipcMain\.handle\('(read-file|write-file|show-open-dialog|show-save-dialog)'/);
  assert.match(preload, /openPresetFile/);
  assert.match(preload, /savePresetFile/);
  assert.doesNotMatch(preload, /\b(readFile|writeFile|showOpenDialog|showSaveDialog)\b/);
});

test('rotary knobs snap fractional steps and expose keyboard-slider semantics', () => {
  const { Class: RotaryKnob } = loadBrowserClass('js/knob-component.js', 'RotaryKnob', { document: {} });
  const knob = Object.create(RotaryKnob.prototype);
  Object.assign(knob, { min: 0, max: 2, step: 0.5, value: 0, onChange: null, updateRotation() {} });
  knob.setValue(0.74);
  assert.equal(knob.value, 0.5);
  knob.setValue(0.76);
  assert.equal(knob.value, 1);
  const source = read('js/knob-component.js');
  assert.match(source, /setAttribute\('role', 'slider'\)/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /dispose\(\)/);
});

test('the experimental worklet respects loopEnd and does not double a mono output', () => {
  let ProcessorClass;
  class WorkletBase {
    constructor() { this.port = { onmessage: null }; }
  }
  const context = {
    AudioWorkletProcessor: WorkletBase,
    registerProcessor(name, Processor) { ProcessorClass = Processor; },
    sampleRate: 48000,
    console
  };
  vm.runInNewContext(read('js/audio-worklet-processor.js'), context, { filename: 'js/audio-worklet-processor.js' });
  const processor = new ProcessorClass();
  processor.handleNoteOn({
    channel: 1,
    note: 60,
    gain: 1,
    pitchRatio: 1,
    sampleBuffer: new Float32Array([1, 2, 3, 4]),
    loopStart: 1,
    loopEnd: 3,
    isLooping: true
  });
  const mono = new Float32Array(5);
  assert.equal(processor.process([], [[mono]], {}), true);
  assert.deepEqual(Array.from(mono), [1, 2, 3, 2, 3]);
  processor.handleNoteOn({ note: 61, sampleBuffer: null });
  assert.equal(processor.voices.length, 1);
});

test('VU analyser replacement disconnects the previous graph branch', () => {
  let frameId = 0;
  const { Class: VuMeterManager } = loadBrowserClass('js/vu-meter.js', 'VuMeterManager', {
    requestAnimationFrame() { return ++frameId; },
    cancelAnimationFrame() {},
    Uint8Array
  });
  const disconnected = [];
  const analysers = [];
  const ctx = {
    createAnalyser() {
      const analyser = { frequencyBinCount: 128, disconnect() { disconnected.push('analyser'); } };
      analysers.push(analyser);
      return analyser;
    }
  };
  const makeSource = (name) => ({
    connect() {},
    disconnect() { disconnected.push(name); }
  });
  const meter = new VuMeterManager({ init: () => ctx });
  meter.createAnalyserForNode(makeSource('first'), 1, null);
  meter.createAnalyserForNode(makeSource('second'), 1, null);
  assert.ok(disconnected.includes('first'));
  assert.ok(disconnected.includes('analyser'));
  assert.equal(meter.analysers.get(1), analysers[1]);
  meter.destroy();
});

test('PWA cache and icon metadata match the shipped app shell', () => {
  const worker = read('sw.js');
  assert.match(worker, /bensf2-workstation-v4/);
  assert.match(worker, /'\.\/assets\/icon-192\.png'/);
  assert.match(worker, /evt\.request\.mode === 'navigate'/);
  for (const [file, expected] of [['assets/icon-192.png', 192], ['assets/icon-512.png', 512]]) {
    const png = fs.readFileSync(path.join(ROOT, file));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), expected);
    assert.equal(png.readUInt32BE(20), expected);
  }
});
