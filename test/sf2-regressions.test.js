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
    setTimeout,
    clearTimeout,
    ...extraGlobals
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, file), 'utf8'), sandbox);
  return sandbox.window[globalName];
}

function audioParam(value = 0) {
  const events = [];
  return {
    value,
    events,
    setValueAtTime(next, time) { this.value = next; events.push(['set', next, time]); },
    setTargetAtTime(next, time, constant) { this.value = next; events.push(['target', next, time, constant]); },
    linearRampToValueAtTime(next, time) { this.value = next; events.push(['ramp', next, time]); },
    cancelScheduledValues(time) { events.push(['cancel', time]); }
  };
}

function createSynthHarness({ hasStereoPanner = true, hasFilter = false } = {}) {
  const sources = [];
  const voicePanners = [];
  const gains = [];
  const filters = [];
  const context = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => {
      const gain = {
        gain: audioParam(1),
        connections: [],
        disconnected: false,
        connect(target) { this.connections.push(target); },
        disconnect() { this.disconnected = true; }
      };
      gains.push(gain);
      return gain;
    },
    ...(hasStereoPanner ? { createStereoPanner: () => {
      const panner = {
        pan: audioParam(0),
        connections: [],
        disconnected: false,
        connect(target) { this.connections.push(target); },
        disconnect() { this.disconnected = true; }
      };
      voicePanners.push(panner);
      return panner;
    } } : {}),
    ...(hasFilter ? { createBiquadFilter: () => {
      const filter = {
        type: '',
        frequency: audioParam(0),
        Q: audioParam(0),
        connections: [],
        disconnected: false,
        connect(target) { this.connections.push(target); },
        disconnect() { this.disconnected = true; }
      };
      filters.push(filter);
      return filter;
    } } : {}),
    createBuffer: (_channels, length) => {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    },
    createBufferSource: () => {
      const source = {
        playbackRate: audioParam(1),
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        disconnected: false,
        stopCount: 0,
        onended: null,
        connect() {},
        disconnect() { this.disconnected = true; },
        start(...args) { this.startArgs = args; },
        stop(...args) { this.stopCount += 1; this.stopArgs = args; }
      };
      sources.push(source);
      return source;
    }
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
  return { synth: new SynthEngine(audioEngine), sources, voicePanners, gains, filters };
}

function makeChunk(id, payload) {
  const paddedSize = payload.length + (payload.length & 1);
  const chunk = Buffer.alloc(8 + paddedSize);
  chunk.write(id, 0, 4, 'ascii');
  chunk.writeUInt32LE(payload.length, 4);
  Buffer.from(payload).copy(chunk, 8);
  return chunk;
}

function makeList(type, subchunks) {
  return makeChunk('LIST', Buffer.concat([Buffer.from(type, 'ascii'), ...subchunks]));
}

function makeSampleHeaderChunk({ sampleLink = 0, sampleType = 1 } = {}) {
  const recordSize = 46;
  const payload = Buffer.alloc(recordSize * 2);

  function writeRecord(index, name, type, link) {
    const start = index * recordSize;
    payload.write(name, start, Math.min(name.length, 20), 'ascii');
    payload.writeUInt32LE(index * 64, start + 20);
    payload.writeUInt32LE((index + 1) * 64, start + 24);
    payload.writeUInt32LE(index * 64, start + 28);
    payload.writeUInt32LE(index * 64, start + 32);
    payload.writeUInt32LE(44100, start + 36);
    payload.writeUInt8(60, start + 40);
    payload.writeInt8(0, start + 41);
    payload.writeUInt16LE(link, start + 42);
    payload.writeUInt16LE(type, start + 44);
  }

  writeRecord(0, 'sample', sampleType, sampleLink);
  writeRecord(1, 'EOS', 1, 0);
  return makeChunk('shdr', payload);
}

function makeSf2(topLevelChunks) {
  const body = Buffer.concat([Buffer.from('sfbk', 'ascii'), ...topLevelChunks]);
  const riff = Buffer.alloc(8 + body.length);
  riff.write('RIFF', 0, 4, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  body.copy(riff, 8);
  return riff.buffer.slice(riff.byteOffset, riff.byteOffset + riff.byteLength);
}

test('SF2 sm24 low bytes are combined into normalized signed 24-bit PCM', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const highWords = Buffer.alloc(4);
  highWords.writeInt16LE(1, 0);
  highWords.writeInt16LE(-1, 2);
  const lowBytes = Buffer.from([0x80, 0x80]);
  const parsed = new SoundFont2Parser(makeSf2([
    makeList('sdta', [makeChunk('smpl', highWords), makeChunk('sm24', lowBytes)])
  ])).parse();
  const { synth } = createSynthHarness();
  synth.loadSoundFont({
    sampleData: parsed.sampleData,
    sampleData24: parsed.sampleData24,
    sampleHeaders: [{
      start: 0, end: 2, startLoop: 0, endLoop: 0,
      sampleRate: 44100, originalPitch: 60, fineTuningSemitones: 0
    }],
    presets: []
  });
  const data = synth.decodedAudioBuffers.get(0).audioBuffer.getChannelData(0);
  assert.ok(Math.abs(data[0] - 384 / 8388608) < 1e-12);
  assert.ok(Math.abs(data[1] - (-128 / 8388608)) < 1e-12);
});

test('a truncated sm24 chunk is rejected explicitly', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const highWords = Buffer.alloc(4);
  assert.throws(
    () => new SoundFont2Parser(makeSf2([
      makeList('sdta', [makeChunk('smpl', highWords), makeChunk('sm24', Buffer.from([0]))])
    ])).parse(),
    /sm24 menor/
  );
});

function loadSingleZone(synth, zoneOverrides = {}, headerOverrides = {}) {
  synth.loadSoundFont({
    sampleData: new Int16Array(64),
    sampleHeaders: [{
      start: 0,
      end: 64,
      startLoop: 8,
      endLoop: 48,
      sampleRate: 44100,
      originalPitch: 60,
      fineTuningSemitones: 0,
      ...headerOverrides
    }],
    presets: [{
      sampleIndices: [0],
      zones: [{
        sampleIndex: 0,
        keyLow: 0,
        keyHigh: 127,
        velLow: 0,
        velHigh: 127,
        rootKey: 60,
        coarseTune: 0,
        fineTune: 0,
        attenuation: 0,
        sampleModes: 0,
        ...zoneOverrides
      }]
    }]
  });
}

test('sampleModes 0 does not loop merely because the header has loop points', () => {
  const { synth, sources } = createSynthHarness();
  loadSingleZone(synth, { sampleModes: 0 });
  synth.noteOn(60, 100, 1);
  assert.equal(sources[0].loop, false);
});

test('sampleModes 3 leaves the loop on note release', () => {
  const { synth, sources } = createSynthHarness();
  loadSingleZone(synth, { sampleModes: 3 });
  synth.noteOn(60, 100, 1);
  assert.equal(sources[0].loop, true);
  synth.noteOff(60, 1);
  assert.equal(sources[0].loop, false);
});

test('pitch bend preserves coarse tune, fine tune, and sample pitch correction', () => {
  const { synth, sources } = createSynthHarness();
  loadSingleZone(
    synth,
    { coarseTune: 1, fineTune: 25 },
    { fineTuningSemitones: 0.5 }
  );
  synth.noteOn(60, 100, 1);
  const initialRate = sources[0].playbackRate.value;
  synth.setPitchBend(1, 2);
  assert.ok(Math.abs(initialRate - Math.pow(2, 1.75 / 12)) < 1e-12);
  assert.ok(
    Math.abs(sources[0].playbackRate.value - initialRate * Math.pow(2, 2 / 12)) < 1e-12
  );
});

test('scaleTuning controls key tracking and remains part of the pitch-bend base rate', () => {
  const { synth, sources } = createSynthHarness();
  loadSingleZone(synth, { scaleTuning: 50 });
  synth.noteOn(72, 100, 1);
  const expectedBaseRate = Math.pow(2, 6 / 12);
  assert.ok(Math.abs(sources[0].playbackRate.value - expectedBaseRate) < 1e-12);
  synth.setPitchBend(1, 2);
  assert.ok(
    Math.abs(sources[0].playbackRate.value - expectedBaseRate * Math.pow(2, 2 / 12)) < 1e-12
  );
});

test('explicit zone pan routes stereo voices to separate per-voice panners', () => {
  const { synth, sources, voicePanners } = createSynthHarness();
  synth.loadSoundFont({
    sampleData: new Int16Array(128),
    sampleHeaders: [0, 1].map((index) => ({
      start: index * 64,
      end: (index + 1) * 64,
      startLoop: index * 64,
      endLoop: index * 64,
      sampleRate: 44100,
      originalPitch: 60,
      fineTuningSemitones: 0,
      sampleLink: 1 - index,
      sampleType: index === 0 ? 4 : 2
    })),
    presets: [{
      sampleIndices: [0, 1],
      zones: [
        { sampleIndex: 0, keyLow: 0, keyHigh: 127, velLow: 0, velHigh: 127, rootKey: 60, pan: -500 },
        { sampleIndex: 1, keyLow: 0, keyHigh: 127, velLow: 0, velHigh: 127, rootKey: 60, pan: 500 }
      ]
    }]
  });

  const channelPannerCount = 16;
  synth.noteOn(60, 100, 1);
  const perVoicePanners = voicePanners.slice(channelPannerCount);
  assert.equal(sources.length, 2);
  assert.deepEqual(perVoicePanners.map((panner) => panner.pan.value), [-1, 1]);
  assert.equal(synth.activeVoices.size, 2);

  synth.stopAllVoices();
  assert.ok(sources.every((source) => source.stopCount === 1));
  assert.equal(synth.getActiveVoicesCount(), 0);
});

test('each loaded bank reserves every sample-header index so invalid samples cannot alias a later bank', () => {
  const { synth, sources } = createSynthHarness();
  synth.loadSoundFont({
    sampleData: new Int16Array(64),
    sampleHeaders: [{
      start: 32,
      end: 96,
      startLoop: 32,
      endLoop: 32,
      sampleRate: 44100,
      originalPitch: 60
    }],
    presets: [{
      sampleIndices: [0],
      zones: [{ sampleIndex: 0, keyLow: 0, keyHigh: 127, velLow: 0, velHigh: 127, rootKey: 60 }]
    }]
  }, 'invalid-a.sf2');

  synth.loadSoundFont({
    sampleData: new Int16Array(128),
    sampleHeaders: [0, 1].map((index) => ({
      start: index * 64,
      end: (index + 1) * 64,
      startLoop: index * 64,
      endLoop: index * 64,
      sampleRate: 44100,
      originalPitch: 60,
      sampleLink: 1 - index,
      sampleType: index === 0 ? 4 : 2
    })),
    presets: [{
      sampleIndices: [0, 1],
      zones: [
        { sampleIndex: 0, sampleLink: 1, sampleType: 4, keyLow: 0, keyHigh: 127, velLow: 0, velHigh: 127, rootKey: 60 },
        { sampleIndex: 1, sampleLink: 0, sampleType: 2, keyLow: 0, keyHigh: 127, velLow: 0, velHigh: 127, rootKey: 60 }
      ]
    }]
  }, 'valid-b.sf2');

  assert.deepEqual(Array.from(synth.decodedAudioBuffers.keys()), [1, 2]);
  assert.deepEqual(
    Array.from(synth.decodedAudioBuffers.values(), (sample) => sample.sampleLink),
    [2, 1]
  );
  assert.deepEqual(
    synth.parsedSf2Data.presets[1].zones.map((zone) => [zone.sampleIndex, zone.sampleLink]),
    [[1, 2], [2, 1]]
  );

  synth.channels[1].assignedPresetIndex = 0;
  synth.noteOn(60, 100, 1);
  assert.equal(sources.length, 0, 'the invalid sample in bank A must remain silent');
});

test('a naturally ended one-shot removes its precise voice and disconnects owned nodes idempotently', () => {
  const { synth, sources } = createSynthHarness();
  loadSingleZone(synth, { sampleModes: 0, pan: 250 });
  synth.noteOn(60, 100, 1);

  const source = sources[0];
  const [voiceId, voice] = [...synth.activeVoices.entries()][0];
  assert.equal(typeof source.onended, 'function');

  source.onended();
  assert.equal(synth.activeVoices.has(voiceId), false);
  assert.equal(source.disconnected, true);
  assert.equal(voice.gainNode.disconnected, true);
  assert.equal(voice.pannerNode.disconnected, true);
  assert.equal(source.stopCount, 0, 'natural cleanup must not stop an already-ended source');

  assert.doesNotThrow(() => source.onended());
  assert.equal(source.stopCount, 0);
});

test('voice gain connects directly to the channel when StereoPannerNode is unavailable', () => {
  const { synth, gains } = createSynthHarness({ hasStereoPanner: false });
  loadSingleZone(synth, { pan: 500 });
  synth.noteOn(60, 100, 1);
  const voiceGain = gains.at(-1);
  assert.equal(synth.activeVoices.size, 1);
  assert.equal(voiceGain.connections[0], synth.channels[1].gainNode);
  assert.equal([...synth.activeVoices.values()][0].pannerNode, null);
});

test('zones outside key or velocity ranges remain silent', () => {
  const { synth, sources } = createSynthHarness();
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
        { sampleIndex: 0, keyLow: 60, keyHigh: 60, velLow: 1, velHigh: 50, rootKey: 60, sampleModes: 0 },
        { sampleIndex: 1, keyLow: 60, keyHigh: 60, velLow: 51, velHigh: 100, rootKey: 60, sampleModes: 0 }
      ]
    }]
  });
  synth.noteOn(60, 127, 1);
  assert.equal(sources.length, 0);
});

test('a missing preset remains silent instead of falling back to decoded samples', () => {
  const { synth, sources } = createSynthHarness();
  loadSingleZone(synth);
  synth.channels[1].assignedPresetIndex = 99;
  synth.noteOn(60, 100, 1);
  assert.equal(sources.length, 0);
});

test('parser applies local-over-global precedence, cross-level sums, range intersection, and EMU attenuation', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const parser = new SoundFont2Parser(new ArrayBuffer(0));
  parser.sampleHeaders = [{ originalPitch: 60 }];
  parser.presets = [{ name: 'merge', bagStart: 0, bagEnd: 2, sampleIndices: [] }];
  parser.pbag = [
    { genNdx: 0 },
    { genNdx: 4 },
    { genNdx: 7 }
  ];
  parser.pgen = [
    { oper: 43, amount: (100 << 8) | 20 },
    { oper: 44, amount: (50 << 8) | 10 },
    { oper: 51, amount: 2 },
    { oper: 48, amount: 100 },
    { oper: 43, amount: (60 << 8) | 30 },
    { oper: 52, amount: 10 },
    { oper: 41, amount: 0 }
  ];
  parser.inst = [{ name: 'instrument', bagNdx: 0 }, { name: 'EOI', bagNdx: 2 }];
  parser.ibag = [{ genNdx: 0 }, { genNdx: 5 }, { genNdx: 9 }];
  parser.igen = [
    { oper: 43, amount: (80 << 8) | 40 },
    { oper: 44, amount: (100 << 8) | 20 },
    { oper: 51, amount: 3 },
    { oper: 52, amount: 20 },
    { oper: 48, amount: 200 },
    { oper: 43, amount: (70 << 8) | 50 },
    { oper: 52, amount: 30 },
    { oper: 48, amount: 300 },
    { oper: 53, amount: 0 }
  ];

  parser.linkPresetsToSamples();
  const zone = parser.presets[0].zones[0];
  assert.deepEqual(
    {
      keyLow: zone.keyLow,
      keyHigh: zone.keyHigh,
      velLow: zone.velLow,
      velHigh: zone.velHigh,
      coarseTune: zone.coarseTune,
      fineTune: zone.fineTune,
      attenuation: zone.attenuation
    },
    {
      keyLow: 50,
      keyHigh: 60,
      velLow: 20,
      velHigh: 50,
      coarseTune: 5,
      fineTune: 40,
      attenuation: 400
    }
  );
});

test('SF2 attenuation remains centibels end-to-end', () => {
  const { synth, gains } = createSynthHarness();
  loadSingleZone(synth, { attenuation: 400 });
  synth.globalVelocitySettings.mode = 'fixed';
  synth.globalVelocitySettings.fixedVel = 127;
  synth.noteOn(60, 127, 1);

  const voiceGainNode = Array.from(synth.activeVoices.values())[0].gainNode;
  const attackEvent = voiceGainNode.gain.events.find(([type, value]) => type === 'ramp' && value > 0.0001);
  assert.ok(attackEvent, JSON.stringify(voiceGainNode.gain.events));
  assert.ok(Math.abs(attackEvent[1] - 0.0085) < 1e-12,
    `400 cB is -40 dB, multiplied by full fixed-velocity gain (0.85); events=${JSON.stringify(voiceGainNode.gain.events)}`);
});

test('polyphony remains a hard ceiling for multi-zone notes and steals with a short fade', () => {
  const { synth, sources } = createSynthHarness();
  synth.maxPolyphony = 2;
  synth.loadSoundFont({
    sampleData: new Int16Array(192),
    sampleHeaders: [0, 1, 2].map((index) => ({
      start: index * 64, end: (index + 1) * 64,
      startLoop: index * 64, endLoop: index * 64,
      sampleRate: 44100, originalPitch: 60, fineTuningSemitones: 0
    })),
    presets: [{
      sampleIndices: [0, 1, 2],
      zones: [0, 1, 2].map((sampleIndex) => ({
        sampleIndex, keyLow: 0, keyHigh: 127, velLow: 0, velHigh: 127,
        rootKey: 60, sampleModes: 0
      }))
    }]
  });

  synth.noteOn(60, 100, 1);
  assert.equal(synth.activeVoices.size, 2);
  synth.noteOn(62, 100, 1);
  assert.equal(synth.activeVoices.size, 2);
  assert.ok(sources.slice(0, 2).every((source) => source.stopArgs[0] === 0.004));
});

test('zone sample offsets and native volume envelope are applied when a voice starts', () => {
  const { synth, sources, gains } = createSynthHarness();
  loadSingleZone(synth, {
    startOffsetSamples: 8,
    endOffsetSamples: -8,
    volumeEnvelope: {
      delayTimecents: -12000,
      attackTimecents: -1200,
      holdTimecents: -12000,
      decayTimecents: -1200,
      sustainCentibels: 60,
      releaseTimecents: -1200,
      keyToHoldTimecents: 0,
      keyToDecayTimecents: 0
    }
  });
  synth.noteOn(60, 127, 1);

  assert.deepEqual(sources[0].startArgs, [0, 8 / 44100, 48 / 44100]);
  const voice = Array.from(synth.activeVoices.values())[0];
  const voiceGainEvents = voice.gainNode.gain.events;
  assert.ok(voiceGainEvents.some(([type, , time]) => type === 'ramp' && Math.abs(time - 0.5009765625) < 1e-12), JSON.stringify(voiceGainEvents));
  assert.ok(voiceGainEvents.some(([type, , time]) => type === 'ramp' && Math.abs(time - 1.001953125) < 1e-12), JSON.stringify(voiceGainEvents));
  synth.noteOff(60, 1);
  assert.equal(voice.envelope.source, 'sf2');
  assert.ok(voice.gainNode.gain.events.some(([type, , time]) => type === 'ramp' && Math.abs(time - 0.5) < 1e-12));
});

test('native SF2 filter creates a bounded low-pass voice stage', () => {
  const { synth, filters } = createSynthHarness({ hasFilter: true });
  loadSingleZone(synth, { initialFilterFc: 6900, initialFilterQ: 120 });
  synth.noteOn(60, 100, 1);

  assert.equal(filters.length, 1);
  assert.equal(filters[0].type, 'lowpass');
  assert.ok(Math.abs(filters[0].frequency.value - 440) < 0.1);
  assert.ok(filters[0].Q.value > Math.SQRT1_2 && filters[0].Q.value < 30);
});

test('exclusive class closes the previous articulation without exceeding polyphony', () => {
  const { synth, sources } = createSynthHarness();
  loadSingleZone(synth, { exclusiveClass: 1 });
  synth.noteOn(60, 100, 1);
  synth.noteOn(62, 100, 1);

  assert.equal(synth.activeVoices.size, 1);
  assert.equal(sources[0].stopArgs[0], 0.004);
  assert.equal(Array.from(synth.activeVoices.values())[0].note, 62);
});

test('track ADSR minimum and zero values are scheduled as configured without falsy fallback', () => {
  const { synth } = createSynthHarness();
  loadSingleZone(synth);
  synth.channels[1].adsr = { attack: 0.001, decay: 0.01, sustain: 0, release: 0 };
  synth.noteOn(60, 100, 1);
  const voice = Array.from(synth.activeVoices.values())[0];
  const ramps = voice.gainNode.gain.events.filter(([type]) => type === 'ramp');
  assert.equal(ramps[0][2], 0.001);
  assert.equal(ramps[1][2], 0.011);
  synth.noteOff(60, 1);
  assert.deepEqual(voice.gainNode.gain.events.at(-1), ['ramp', 0.0001, 0.001],
    'zero release uses only the documented 1 ms safety ramp, never 250 ms');
});

test('parser applies scaleTuning and pan defaults, overrides, offsets, and clamps', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const parser = new SoundFont2Parser(new ArrayBuffer(0));
  parser.sampleHeaders = [{ originalPitch: 60, sampleLink: 7, sampleType: 4 }];
  parser.presets = [{ name: 'merge', bagStart: 0, bagEnd: 2, sampleIndices: [] }];
  parser.pbag = [{ genNdx: 0 }, { genNdx: 2 }, { genNdx: 5 }];
  parser.pgen = [
    { oper: 56, amount: 20 },
    { oper: 17, amount: 400 },
    { oper: 56, amount: 50 },
    { oper: 17, amount: 300 },
    { oper: 41, amount: 0 }
  ];
  parser.inst = [{ name: 'instrument', bagNdx: 0 }, { name: 'EOI', bagNdx: 2 }];
  parser.ibag = [{ genNdx: 0 }, { genNdx: 2 }, { genNdx: 5 }];
  parser.igen = [
    { oper: 56, amount: 200 },
    { oper: 17, amount: 300 },
    { oper: 56, amount: 1200 },
    { oper: 17, amount: 300 },
    { oper: 53, amount: 0 }
  ];

  parser.linkPresetsToSamples();
  const zone = parser.presets[0].zones[0];
  assert.deepEqual(
    {
      scaleTuning: zone.scaleTuning,
      pan: zone.pan,
      sampleLink: zone.sampleLink,
      sampleType: zone.sampleType
    },
    { scaleTuning: 1200, pan: 500, sampleLink: 7, sampleType: 4 }
  );
});

test('parser carries high-impact address, envelope, filter and voice-control generators into zones', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const parser = new SoundFont2Parser(new ArrayBuffer(0));
  parser.sampleHeaders = [{ originalPitch: 60 }];
  parser.presets = [{ name: 'extended', bagStart: 0, bagEnd: 1, sampleIndices: [] }];
  parser.pbag = [{ genNdx: 0 }, { genNdx: 1 }];
  parser.pgen = [{ oper: 41, amount: 0 }];
  parser.inst = [{ name: 'instrument', bagNdx: 0 }, { name: 'EOI', bagNdx: 1 }];
  parser.ibag = [{ genNdx: 0 }, { genNdx: 13 }];
  parser.igen = [
    { oper: 0, amount: 8 },
    { oper: 1, amount: 0xfff8 },
    { oper: 2, amount: 4 },
    { oper: 3, amount: 0xfffc },
    { oper: 8, amount: 9000 },
    { oper: 9, amount: 120 },
    { oper: 33, amount: 0x8000 }, // absolute zero time
    { oper: 34, amount: 0xfb50 }, // -1200 timecents
    { oper: 36, amount: 0xfb50 },
    { oper: 37, amount: 60 },
    { oper: 38, amount: 0xfb50 },
    { oper: 46, amount: 64 },
    { oper: 47, amount: 100 },
    { oper: 57, amount: 3 },
    { oper: 53, amount: 0 }
  ];
  parser.ibag[1].genNdx = parser.igen.length;

  parser.linkPresetsToSamples();
  const zone = parser.presets[0].zones[0];
  assert.deepEqual({
    start: zone.startOffsetSamples,
    end: zone.endOffsetSamples,
    loopStart: zone.startLoopOffsetSamples,
    loopEnd: zone.endLoopOffsetSamples,
    filterFc: zone.initialFilterFc,
    filterQ: zone.initialFilterQ,
    exclusiveClass: zone.exclusiveClass,
    forcedKey: zone.forcedKey,
    forcedVelocity: zone.forcedVelocity,
    delay: zone.volumeEnvelope.delayTimecents,
    attack: zone.volumeEnvelope.attackTimecents,
    sustain: zone.volumeEnvelope.sustainCentibels
  }, {
    start: 8, end: -8, loopStart: 4, loopEnd: -4,
    filterFc: 9000, filterQ: 120, exclusiveClass: 3,
    forcedKey: 64, forcedVelocity: 100, delay: -32768, attack: -1200, sustain: 60
  });
});

test('parser uses the instrument defaults when scaleTuning and pan are absent', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const parser = new SoundFont2Parser(new ArrayBuffer(0));
  parser.sampleHeaders = [{ originalPitch: 60 }];
  parser.presets = [{ name: 'defaults', bagStart: 0, bagEnd: 1, sampleIndices: [] }];
  parser.pbag = [{ genNdx: 0 }, { genNdx: 1 }];
  parser.pgen = [{ oper: 41, amount: 0 }];
  parser.inst = [{ name: 'instrument', bagNdx: 0 }, { name: 'EOI', bagNdx: 1 }];
  parser.ibag = [{ genNdx: 0 }, { genNdx: 1 }];
  parser.igen = [{ oper: 53, amount: 0 }];
  parser.linkPresetsToSamples();
  assert.deepEqual(
    { scaleTuning: parser.presets[0].zones[0].scaleTuning, pan: parser.presets[0].zones[0].pan },
    { scaleTuning: 100, pan: 0 }
  );
});

test('disjoint preset and instrument ranges produce no zones and no sources', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const parser = new SoundFont2Parser(new ArrayBuffer(0));
  parser.sampleData = new Int16Array(64);
  parser.sampleHeaders = [{
    start: 0,
    end: 64,
    startLoop: 0,
    endLoop: 0,
    sampleRate: 44100,
    originalPitch: 60,
    fineTuningSemitones: 0
  }];
  parser.presets = [{ name: 'disjoint', bagStart: 0, bagEnd: 1, sampleIndices: [] }];
  parser.pbag = [{ genNdx: 0 }, { genNdx: 2 }];
  parser.pgen = [
    { oper: 43, amount: (40 << 8) | 0 },
    { oper: 41, amount: 0 }
  ];
  parser.inst = [{ name: 'instrument', bagNdx: 0 }, { name: 'EOI', bagNdx: 1 }];
  parser.ibag = [{ genNdx: 0 }, { genNdx: 2 }];
  parser.igen = [
    { oper: 43, amount: (127 << 8) | 60 },
    { oper: 53, amount: 0 }
  ];

  parser.linkPresetsToSamples();

  const { synth, sources } = createSynthHarness();
  synth.loadSoundFont({
    sampleData: parser.sampleData,
    sampleHeaders: parser.sampleHeaders,
    presets: parser.presets
  });
  synth.noteOn(64, 100, 1);

  assert.deepEqual(
    { zoneCount: parser.presets[0].zones.length, sourceCount: sources.length },
    { zoneCount: 0, sourceCount: 0 }
  );
});

test('parser preserves the full valid 0-127 originalPitch range', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const recordSize = 46;
  const recordCount = 3;
  const buffer = new ArrayBuffer(8 + recordSize * recordCount);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  bytes.set(Buffer.from('shdr'), 0);
  view.setUint32(4, recordSize * recordCount, true);

  function writeRecord(index, name, originalPitch) {
    const start = 8 + index * recordSize;
    bytes.set(Buffer.from(name), start);
    view.setUint32(start + 20, index * 64, true);
    view.setUint32(start + 24, (index + 1) * 64, true);
    view.setUint32(start + 28, index * 64, true);
    view.setUint32(start + 32, index * 64, true);
    view.setUint32(start + 36, 44100, true);
    view.setUint8(start + 40, originalPitch);
    view.setInt8(start + 41, 0);
    view.setUint16(start + 42, 0, true);
    view.setUint16(start + 44, 1, true);
  }

  writeRecord(0, 'low', 0);
  writeRecord(1, 'high', 127);
  writeRecord(2, 'EOS', 0);

  const parser = new SoundFont2Parser(buffer);
  parser.parsePdta(buffer.byteLength);
  assert.deepEqual(
    Array.from(parser.sampleHeaders, (header) => header.originalPitch),
    [0, 127]
  );
});

test('binary SF3 sample headers preserve linkage and are rejected instead of decoded as PCM noise', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const parsed = new SoundFont2Parser(makeSf2([
    makeList('pdta', [makeSampleHeaderChunk({ sampleLink: 9, sampleType: 0x10 | 4 })])
  ])).parse();
  assert.deepEqual(
    {
      sampleLink: parsed.sampleHeaders[0].sampleLink,
      sampleType: parsed.sampleHeaders[0].sampleType,
      isCompressed: parsed.sampleHeaders[0].isCompressed
    },
    { sampleLink: 9, sampleType: 0x14, isCompressed: true }
  );

  const { synth } = createSynthHarness();
  assert.throws(
    () => synth.loadSoundFont({
      sampleData: new Int16Array(64),
      sampleHeaders: parsed.sampleHeaders,
      presets: parsed.presets
    }, 'compressed.sf3'),
    /SF3.*comprimid.*n.o.*suportad/i
  );
  const indexSource = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const appSource = fs.readFileSync(path.join(projectRoot, 'js/app.js'), 'utf8');
  assert.doesNotMatch(indexSource, /accept="[^"]*\.sf3/i);
  assert.doesNotMatch(appSource, /endsWith\('\.sf3'\)/i);
});

test('RIFF and LIST parsers skip pad bytes after odd-sized chunks', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const topLevelOdd = makeSf2([
    makeChunk('JUNK', Buffer.from([1])),
    makeList('pdta', [makeSampleHeaderChunk()])
  ]);
  const nestedOdd = makeSf2([
    makeList('pdta', [makeChunk('JUNK', Buffer.from([1])), makeSampleHeaderChunk()])
  ]);
  assert.equal(new SoundFont2Parser(topLevelOdd).parse().sampleHeaders.length, 1);
  assert.equal(new SoundFont2Parser(nestedOdd).parse().sampleHeaders.length, 1);
});

test('malformed RIFF and LIST bounds throw one stable SF2 format error', () => {
  const SoundFont2Parser = loadBrowserClass('js/sf2-parser.js', 'SoundFont2Parser');
  const stableFormatMessage = 'Arquivo SF2 inválido: estrutura RIFF/LIST truncada ou fora dos limites.';

  const shortHeader = Buffer.from('RIFF', 'ascii');
  const oversizedRiff = Buffer.from(makeSf2([]));
  oversizedRiff.writeUInt32LE(oversizedRiff.length + 16, 4);

  const truncatedTopHeader = Buffer.from(makeSf2([]));
  const topBody = Buffer.concat([truncatedTopHeader, Buffer.from('JUNK', 'ascii')]);
  topBody.writeUInt32LE(topBody.length - 8, 4);

  const oversizedTopChunk = Buffer.from(makeSf2([makeChunk('JUNK', Buffer.alloc(0))]));
  oversizedTopChunk.writeUInt32LE(64, 16);

  const shortListPayload = Buffer.from(makeSf2([makeChunk('LIST', Buffer.alloc(2))]));

  const oversizedListSubchunk = Buffer.from(makeSf2([
    makeList('pdta', [makeChunk('JUNK', Buffer.alloc(0))])
  ]));
  oversizedListSubchunk.writeUInt32LE(64, 28);

  for (const malformed of [
    shortHeader,
    oversizedRiff,
    topBody,
    oversizedTopChunk,
    shortListPayload,
    oversizedListSubchunk
  ]) {
    const arrayBuffer = malformed.buffer.slice(
      malformed.byteOffset,
      malformed.byteOffset + malformed.byteLength
    );
    assert.throws(
      () => new SoundFont2Parser(arrayBuffer).parse(),
      (error) => error.name === 'Error' && error.message === stableFormatMessage
    );
  }
});

test('service worker cache version invalidates stale app shells and includes performance input', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  assert.match(source, /const CACHE_NAME = 'bensf2-workstation-v4';/);
  assert.match(source, /'\.\/js\/performance-input\.js'/);
  assert.match(source, /if \(key !== CACHE_NAME\)[\s\S]*caches\.delete\(key\)/);
  const localScripts = Array.from(html.matchAll(/<script src="(js\/[^"?]+)"/g), (match) => match[1]);
  localScripts.forEach((scriptPath) => {
    assert.match(source, new RegExp(`'\\./${scriptPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  });
});
