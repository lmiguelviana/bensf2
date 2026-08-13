const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const fixturePath = process.env.BENSF2_TEST_SF2;

function loadBrowserClass(file, globalName, extraGlobals = {}) {
  const sandbox = {
    window: {},
    console,
    Math,
    Map,
    Set,
    setTimeout,
    clearTimeout,
    ...extraGlobals
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, file), 'utf8'), sandbox);
  return sandbox.window[globalName];
}

function parseFixture() {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser', {
    ArrayBuffer,
    DataView,
    Int16Array,
    Uint8Array
  });
  const source = fs.readFileSync(fixturePath);
  const arrayBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  return new SoundFont2Parser(arrayBuffer).parse();
}

test('an external real-world SF2 fixture parses into valid sample-backed zones', {
  skip: !fixturePath
}, () => {
  const parsed = parseFixture();

  assert.ok(parsed.sampleHeaders.length > 0, 'fixture must expose sample headers');
  assert.ok(parsed.presets.length > 0, 'fixture must expose presets');

  const zones = parsed.presets.flatMap((preset) => preset.zones || []);
  assert.ok(zones.length > 0, 'fixture must expose playable zones');
  zones.forEach((zone) => {
    assert.ok(zone.sampleIndex >= 0 && zone.sampleIndex < parsed.sampleHeaders.length);
    assert.ok(zone.keyLow >= 0 && zone.keyLow <= zone.keyHigh && zone.keyHigh <= 127);
    assert.ok(zone.velLow >= 0 && zone.velLow <= zone.velHigh && zone.velHigh <= 127);
  });
  assert.ok(zones.some((zone) => zone.volumeEnvelope),
    'fixture must preserve at least one native SF2 volume envelope');
  assert.ok(zones.some((zone) => zone.initialFilterFc !== null),
    'fixture must preserve at least one native SF2 filter cutoff');
  assert.ok(zones.some((zone) => zone.startOffsetSamples || zone.endOffsetSamples ||
    zone.startLoopOffsetSamples || zone.endLoopOffsetSamples),
  'fixture must preserve at least one sample/loop address offset');

  console.log(JSON.stringify({
    fixture: path.basename(fixturePath),
    presets: parsed.presets.length,
    samples: parsed.sampleHeaders.length,
    zones: zones.length,
    velocityRestrictedZones: zones.filter((zone) => zone.velLow > 0 || zone.velHigh < 127).length,
    nativeEnvelopeZones: zones.filter((zone) => zone.volumeEnvelope).length,
    nativeFilterZones: zones.filter((zone) => zone.initialFilterFc !== null).length
  }));
});

test('a real SF2 velocity-layered preset selects different samples and gains for soft and hard notes', {
  skip: !fixturePath
}, (t) => {
  const parsed = parseFixture();
  let candidate = null;
  for (const preset of parsed.presets) {
    for (let note = 0; note <= 127; note++) {
      const soft = (preset.zones || []).filter((zone) =>
        note >= zone.keyLow && note <= zone.keyHigh && 20 >= zone.velLow && 20 <= zone.velHigh);
      const hard = (preset.zones || []).filter((zone) =>
        note >= zone.keyLow && note <= zone.keyHigh && 120 >= zone.velLow && 120 <= zone.velHigh);
      const softIds = [...new Set(soft.map((zone) => zone.sampleIndex))].sort((a, b) => a - b);
      const hardIds = [...new Set(hard.map((zone) => zone.sampleIndex))].sort((a, b) => a - b);
      if (softIds.length > 0 && hardIds.length > 0 && softIds.join(',') !== hardIds.join(',')) {
        candidate = { preset, note, soft, hard, softIds, hardIds };
        break;
      }
    }
    if (candidate) break;
  }

  if (!candidate) {
    t.skip('fixture has no distinct zones at velocities 20 and 120');
    return;
  }

  const selectedZones = [...new Set([...candidate.soft, ...candidate.hard])];
  const originalIndices = [...new Set(selectedZones.map((zone) => zone.sampleIndex))];
  const indexMap = new Map(originalIndices.map((sampleIndex, index) => [sampleIndex, index]));
  const sampleLengths = originalIndices.map((sampleIndex) => {
    const header = parsed.sampleHeaders[sampleIndex];
    return header.end - header.start;
  });
  const compactData = new Int16Array(sampleLengths.reduce((sum, length) => sum + length, 0));
  let cursor = 0;
  const compactHeaders = originalIndices.map((sampleIndex) => {
    const header = parsed.sampleHeaders[sampleIndex];
    const length = header.end - header.start;
    compactData.set(parsed.sampleData.subarray(header.start, header.end), cursor);
    const compact = {
      ...header,
      start: cursor,
      end: cursor + length,
      startLoop: cursor + Math.max(0, header.startLoop - header.start),
      endLoop: cursor + Math.max(0, header.endLoop - header.start),
      sampleLink: indexMap.has(header.sampleLink) ? indexMap.get(header.sampleLink) : 0
    };
    cursor += length;
    return compact;
  });
  const compactPreset = {
    ...candidate.preset,
    sampleIndices: originalIndices.map((_, index) => index),
    zones: selectedZones.map((zone) => ({ ...zone, sampleIndex: indexMap.get(zone.sampleIndex) }))
  };

  const sources = [];
  const audioParam = (value = 0) => ({
    value,
    events: [],
    setValueAtTime(next, time) { this.value = next; this.events.push(['set', next, time]); },
    setTargetAtTime(next, time) { this.value = next; this.events.push(['target', next, time]); },
    linearRampToValueAtTime(next, time) { this.value = next; this.events.push(['ramp', next, time]); },
    cancelScheduledValues() {}
  });
  let nextBufferId = 0;
  const context = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => ({ gain: audioParam(1), connect() {}, disconnect() {} }),
    createStereoPanner: () => ({ pan: audioParam(0), connect() {}, disconnect() {} }),
    createBuffer: (_channels, length) => ({
      testId: nextBufferId++,
      getChannelData: () => new Float32Array(length)
    }),
    createBufferSource: () => {
      const source = {
        buffer: null,
        playbackRate: audioParam(1),
        connect() {},
        disconnect() {},
        start() {},
        stop() {},
        onended: null
      };
      sources.push(source);
      return source;
    }
  };
  const SynthEngine = loadBrowserClass('js/synth-engine.js', 'SynthEngine', {
    navigator: { userAgent: 'node-test' }
  });
  const synth = new SynthEngine({
    ctx: context,
    masterGain: {},
    init: () => context,
    resume() {},
    getCurrentTime: () => context.currentTime
  });
  synth.loadSoundFont({ sampleData: compactData, sampleHeaders: compactHeaders, presets: [compactPreset] });

  synth.noteOn(candidate.note, 20, 1);
  const softBuffers = sources.map((source) => source.buffer.testId).sort((a, b) => a - b);
  const scheduledPeak = (voice) => Math.max(...voice.gainNode.gain.events.map((event) => event[1] || 0));
  const softGain = Math.max(...Array.from(synth.activeVoices.values()).map(scheduledPeak));
  synth.stopAllVoices();
  sources.length = 0;

  synth.noteOn(candidate.note, 120, 1);
  const hardBuffers = sources.map((source) => source.buffer.testId).sort((a, b) => a - b);
  const hardGain = Math.max(...Array.from(synth.activeVoices.values()).map(scheduledPeak));

  const expectedSoft = Array.from(candidate.soft, (zone) => indexMap.get(zone.sampleIndex)).sort((a, b) => a - b);
  const expectedHard = Array.from(candidate.hard, (zone) => indexMap.get(zone.sampleIndex)).sort((a, b) => a - b);
  assert.deepEqual(softBuffers, expectedSoft);
  assert.deepEqual(hardBuffers, expectedHard);
  assert.ok(hardGain > softGain * 10, `expected hard gain ${hardGain} to greatly exceed soft gain ${softGain}`);
});
