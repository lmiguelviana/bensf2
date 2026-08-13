/**
 * SOUNDFONT 2 (SF2) BINARY PARSER WITH GENERATOR LINKING
 * Parser binário SF2 com suporte a geradores de instrumentos (pgen/igen) para mapeamento exato de timbres e afinação.
 */

class SoundFont2Parser {
  constructor(arrayBuffer) {
    this.buffer = arrayBuffer;
    this.view = new DataView(arrayBuffer);
    this.offset = 0;

    this.presets = [];
    this.sampleHeaders = [];
    this.sampleData = null;
    this.sampleData24 = null;

    this.pbag = [];
    this.pgen = [];
    this.inst = [];
    this.ibag = [];
    this.igen = [];
  }

  cleanString(str) {
    if (!str) return 'Sem Nome';
    return str.replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim() || 'Preset Sem Nome';
  }

  readString(length) {
    let str = '';
    for (let i = 0; i < length; i++) {
      const charCode = this.view.getUint8(this.offset + i);
      if (charCode !== 0 && charCode >= 32 && charCode <= 126) {
        str += String.fromCharCode(charCode);
      }
    }
    this.offset += length;
    return this.cleanString(str);
  }

  readFourCC() {
    return this.readString(4);
  }

  readUint32() {
    const val = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readUint16() {
    const val = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return val;
  }

  readInt16() {
    const val = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return val;
  }

  readUint8() {
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readInt8() {
    const val = this.view.getInt8(this.offset);
    this.offset += 1;
    return val;
  }

  invalidBounds() {
    return new Error('Arquivo SF2 inválido: estrutura RIFF/LIST truncada ou fora dos limites.');
  }

  readChunkBounds(parentEnd) {
    if (this.offset + 8 > parentEnd) throw this.invalidBounds();
    const chunkId = this.readFourCC();
    const chunkSize = this.readUint32();
    const payloadEnd = this.offset + chunkSize;
    const alignedEnd = payloadEnd + (chunkSize & 1);
    if (payloadEnd < this.offset || alignedEnd > parentEnd) throw this.invalidBounds();
    return { chunkId, chunkSize, payloadEnd, alignedEnd };
  }

  parse() {
    if (this.buffer.byteLength < 12) throw this.invalidBounds();
    const riff = this.readFourCC();
    if (riff !== 'RIFF') {
      throw new Error('Arquivo SF2 inválido: Cabeçalho RIFF não encontrado.');
    }

    const fileSize = this.readUint32();
    const riffEnd = 8 + fileSize;
    if (fileSize < 4 || riffEnd < 12 || riffEnd > this.buffer.byteLength) {
      throw this.invalidBounds();
    }
    const sfbk = this.readFourCC();
    if (sfbk !== 'sfbk') {
      throw new Error('Arquivo SF2 inválido: Recipiente sfbk não encontrado.');
    }

    while (this.offset < riffEnd) {
      const { chunkId, chunkSize, payloadEnd, alignedEnd } = this.readChunkBounds(riffEnd);

      if (chunkId === 'LIST') {
        if (chunkSize < 4) throw this.invalidBounds();
        const listType = this.readFourCC();
        if (listType === 'sdta') {
          this.parseSdta(payloadEnd);
        } else if (listType === 'pdta') {
          this.parsePdta(payloadEnd);
        } else {
          this.offset = payloadEnd;
        }
      } else {
        this.offset = payloadEnd;
      }
      this.offset = alignedEnd;
    }

    this.linkPresetsToSamples();

    return {
      presets: this.presets,
      sampleHeaders: this.sampleHeaders,
      sampleData: this.sampleData,
      sampleData24: this.sampleData24
    };
  }

  parseSdta(endOffset) {
    if (endOffset > this.buffer.byteLength) throw this.invalidBounds();
    while (this.offset < endOffset) {
      const { chunkId: subId, chunkSize: subSize, payloadEnd, alignedEnd } =
        this.readChunkBounds(endOffset);

      if (subId === 'smpl') {
        const sampleCount = Math.floor(subSize / 2);
        this.sampleData = new Int16Array(this.buffer, this.offset, sampleCount);
      } else if (subId === 'sm24') {
        this.sampleData24 = new Uint8Array(this.buffer, this.offset, subSize);
      }
      this.offset = alignedEnd;
    }

    if (this.sampleData24 && (!this.sampleData || this.sampleData24.length < this.sampleData.length)) {
      throw new Error('Arquivo SF2 inválido: chunk sm24 menor que o chunk smpl correspondente.');
    }
  }

  parsePdta(endOffset) {
    let phdrRaw = [];

    if (endOffset > this.buffer.byteLength) throw this.invalidBounds();
    while (this.offset < endOffset) {
      const { chunkId: subId, chunkSize: subSize, payloadEnd, alignedEnd } =
        this.readChunkBounds(endOffset);

      if (subId === 'phdr') {
        const count = Math.floor(subSize / 38);
        for (let i = 0; i < count; i++) {
          const name = this.readString(20);
          const preset = this.readUint16();
          const bank = this.readUint16();
          const bagIdx = this.readUint16();
          const library = this.readUint32();
          const genre = this.readUint32();
          const morphology = this.readUint32();

          phdrRaw.push({ name: this.cleanString(name), preset, bank, bagIdx });
        }
        this.offset = alignedEnd;
      } else if (subId === 'pbag') {
        const count = Math.floor(subSize / 4);
        for (let i = 0; i < count; i++) {
          this.pbag.push({ genNdx: this.readUint16(), modNdx: this.readUint16() });
        }
        this.offset = alignedEnd;
      } else if (subId === 'pgen') {
        const count = Math.floor(subSize / 4);
        for (let i = 0; i < count; i++) {
          this.pgen.push({ oper: this.readUint16(), amount: this.readUint16() });
        }
        this.offset = alignedEnd;
      } else if (subId === 'inst') {
        const count = Math.floor(subSize / 22);
        for (let i = 0; i < count; i++) {
          this.inst.push({ name: this.readString(20), bagNdx: this.readUint16() });
        }
        this.offset = alignedEnd;
      } else if (subId === 'ibag') {
        const count = Math.floor(subSize / 4);
        for (let i = 0; i < count; i++) {
          this.ibag.push({ genNdx: this.readUint16(), modNdx: this.readUint16() });
        }
        this.offset = alignedEnd;
      } else if (subId === 'igen') {
        const count = Math.floor(subSize / 4);
        for (let i = 0; i < count; i++) {
          this.igen.push({ oper: this.readUint16(), amount: this.readUint16() });
        }
        this.offset = alignedEnd;
      } else if (subId === 'shdr') {
        const count = Math.floor(subSize / 46);
        for (let i = 0; i < count - 1; i++) {
          const name = this.readString(20);
          const start = this.readUint32();
          const end = this.readUint32();
          const startLoop = this.readUint32();
          const endLoop = this.readUint32();
          const sampleRate = this.readUint32();
          const rawPitch = this.readUint8();
          const pitchCorrection = this.readInt8();
          const sampleLink = this.readUint16();
          const sampleType = this.readUint16();

          // SF2 permite toda a faixa MIDI 0..127; apenas valores acima dela são inválidos.
          const validPitch = rawPitch <= 127 ? rawPitch : 60;

          if (name && name !== 'EOS') {
            const isCompressed = (sampleType & 0x10) !== 0;
            // pitchCorrection: ajuste fino de afinação em cents (-99 a +99)
            // Convertido para semitones fracionários: cents / 100
            const fineTuningSemitones = (pitchCorrection && pitchCorrection !== 0) ? (pitchCorrection / 100.0) : 0;

            this.sampleHeaders.push({
              name: this.cleanString(name), 
              start, 
              end, 
              startLoop, 
              endLoop, 
              sampleRate, 
              originalPitch: validPitch,
              fineTuningSemitones,  // ← ajuste fino de pitch em semitones fracionários
              sampleLink,
              sampleType,
              isCompressed
            });
          }
        }
        this.offset = alignedEnd;
      } else {
        this.offset = alignedEnd;
      }
    }

    // Processar Presets válidos (excluindo o marcador final EOP)
    for (let i = 0; i < phdrRaw.length - 1; i++) {
      const p = phdrRaw[i];
      if (p.name && p.name !== 'EOP') {
        const nextBag = phdrRaw[i + 1] ? phdrRaw[i + 1].bagIdx : this.pbag.length;
        this.presets.push({
          name: p.name,
          preset: p.preset,
          bank: p.bank,
          bagStart: p.bagIdx,
          bagEnd: nextBag,
          sampleIndices: []
        });
      }
    }
  }

  parseGens(genArray, startIdx, endIdx) {
    const res = {};
    for (let i = startIdx; i < endIdx && i < genArray.length; i++) {
      const g = genArray[i];
      const oper = g.oper;
      const amount = g.amount;
      const signedAmount = amount >= 0x8000 ? amount - 0x10000 : amount;

      switch (oper) {
        case 0: // startAddrsOffset (sample points)
          res.startAddrsOffset = signedAmount;
          break;
        case 1: // endAddrsOffset (sample points)
          res.endAddrsOffset = signedAmount;
          break;
        case 2: // startloopAddrsOffset (sample points)
          res.startloopAddrsOffset = signedAmount;
          break;
        case 3: // endloopAddrsOffset (sample points)
          res.endloopAddrsOffset = signedAmount;
          break;
        case 4: // startAddrsCoarseOffset (32768 sample-point blocks)
          res.startAddrsCoarseOffset = signedAmount;
          break;
        case 8: // initialFilterFc (absolute cents)
          res.initialFilterFc = signedAmount;
          break;
        case 9: // initialFilterQ (centibels)
          res.initialFilterQ = signedAmount;
          break;
        case 12: // endAddrsCoarseOffset
          res.endAddrsCoarseOffset = signedAmount;
          break;
        case 17: // pan (-500 left to +500 right)
          res.pan = signedAmount;
          break;
        case 33: // delayVolEnv (timecents)
          res.delayVolEnv = signedAmount;
          break;
        case 34: // attackVolEnv (timecents)
          res.attackVolEnv = signedAmount;
          break;
        case 35: // holdVolEnv (timecents)
          res.holdVolEnv = signedAmount;
          break;
        case 36: // decayVolEnv (timecents)
          res.decayVolEnv = signedAmount;
          break;
        case 37: // sustainVolEnv (centibels below peak)
          res.sustainVolEnv = signedAmount;
          break;
        case 38: // releaseVolEnv (timecents)
          res.releaseVolEnv = signedAmount;
          break;
        case 39: // keynumToVolEnvHold (timecents per key)
          res.keynumToVolEnvHold = signedAmount;
          break;
        case 40: // keynumToVolEnvDecay (timecents per key)
          res.keynumToVolEnvDecay = signedAmount;
          break;
        case 41: // instrumentID
          res.instrumentID = amount;
          break;
        case 43: // keyRange
          res.keyLow = amount & 0xff;
          res.keyHigh = (amount >> 8) & 0xff;
          break;
        case 44: // velRange
          res.velLow = amount & 0xff;
          res.velHigh = (amount >> 8) & 0xff;
          break;
        case 45: // startloopAddrsCoarseOffset
          res.startloopAddrsCoarseOffset = signedAmount;
          break;
        case 46: // keynum: force the effective MIDI key for this zone
          if (amount <= 127) res.forcedKey = amount;
          break;
        case 47: // velocity: force the effective MIDI velocity for this zone
          if (amount <= 127) res.forcedVelocity = amount;
          break;
        case 48: // initialAttenuation (centibels)
          res.attenuation = signedAmount;
          break;
        case 51: // coarseTune (semitones)
          res.coarseTune = signedAmount;
          break;
        case 52: // fineTune (cents)
          res.fineTune = signedAmount;
          break;
        case 53: // sampleID
          res.sampleID = amount;
          break;
        case 54: // sampleModes
          res.sampleModes = amount;
          break;
        case 50: // endloopAddrsCoarseOffset
          res.endloopAddrsCoarseOffset = signedAmount;
          break;
        case 56: // scaleTuning (cents per key; instrument default is 100)
          res.scaleTuning = signedAmount;
          break;
        case 57: // exclusiveClass
          res.exclusiveClass = amount;
          break;
        case 58: // overridingRootKey
          if (signedAmount >= 0 && signedAmount <= 127) {
            res.overridingRootKey = signedAmount;
          }
          break;
      }
    }
    return res;
  }

  mergeZoneGens(globalGens, localGens) {
    return { ...(globalGens || {}), ...(localGens || {}) };
  }

  linkPresetsToSamples() {
    const totalSamples = this.sampleHeaders.length;
    if (totalSamples === 0) return;

    this.presets.forEach((preset, presetIdx) => {
      const sampleSet = new Set();
      const zones = [];
      let presetGlobalGen = {};

      if (preset.bagStart < preset.bagEnd && this.pbag[preset.bagStart]) {
        const firstPbag = this.pbag[preset.bagStart];
        const nextPgen = this.pbag[preset.bagStart + 1]
          ? this.pbag[preset.bagStart + 1].genNdx
          : this.pgen.length;
        const firstPGen = this.parseGens(this.pgen, firstPbag.genNdx, nextPgen);
        if (firstPGen.instrumentID === undefined) {
          presetGlobalGen = firstPGen;
        }
      }

      for (let b = preset.bagStart; b < preset.bagEnd && b < this.pbag.length; b++) {
        const pbagObj = this.pbag[b];
        const nextPgenNdx = this.pbag[b + 1] ? this.pbag[b + 1].genNdx : this.pgen.length;
        const pGen = this.parseGens(this.pgen, pbagObj.genNdx, nextPgenNdx);

        if (pGen.instrumentID !== undefined && this.inst[pGen.instrumentID]) {
          const effectivePresetGen = this.mergeZoneGens(presetGlobalGen, pGen);
          const instObj = this.inst[pGen.instrumentID];
          const nextInstBagNdx = this.inst[pGen.instrumentID + 1] ? this.inst[pGen.instrumentID + 1].bagNdx : this.ibag.length;

          // Global Zone do Instrumento (primeira ibag sem sampleID)
          let instGlobalGen = {};
          if (instObj.bagNdx < nextInstBagNdx) {
            const firstIbag = this.ibag[instObj.bagNdx];
            const nextIgen = this.ibag[instObj.bagNdx + 1] ? this.ibag[instObj.bagNdx + 1].genNdx : this.igen.length;
            const firstIGen = this.parseGens(this.igen, firstIbag.genNdx, nextIgen);
            if (firstIGen.sampleID === undefined) {
              instGlobalGen = firstIGen;
            }
          }

          // Sample Zones (ibags com sampleID)
          for (let ib = instObj.bagNdx; ib < nextInstBagNdx && ib < this.ibag.length; ib++) {
            const ibagObj = this.ibag[ib];
            const nextIgenNdx = this.ibag[ib + 1] ? this.ibag[ib + 1].genNdx : this.igen.length;
            const iGen = this.parseGens(this.igen, ibagObj.genNdx, nextIgenNdx);

            if (iGen.sampleID !== undefined && iGen.sampleID < totalSamples) {
              const effectiveInstGen = this.mergeZoneGens(instGlobalGen, iGen);
              const sHeader = this.sampleHeaders[iGen.sampleID];
              const keyLow = Math.max(
                effectivePresetGen.keyLow !== undefined ? effectivePresetGen.keyLow : 0,
                effectiveInstGen.keyLow !== undefined ? effectiveInstGen.keyLow : 0
              );
              const keyHigh = Math.min(
                effectivePresetGen.keyHigh !== undefined ? effectivePresetGen.keyHigh : 127,
                effectiveInstGen.keyHigh !== undefined ? effectiveInstGen.keyHigh : 127
              );
              const velLow = Math.max(
                effectivePresetGen.velLow !== undefined ? effectivePresetGen.velLow : 0,
                effectiveInstGen.velLow !== undefined ? effectiveInstGen.velLow : 0
              );
              const velHigh = Math.min(
                effectivePresetGen.velHigh !== undefined ? effectivePresetGen.velHigh : 127,
                effectiveInstGen.velHigh !== undefined ? effectiveInstGen.velHigh : 127
              );

              if (keyLow > keyHigh || velLow > velHigh) continue;

              sampleSet.add(iGen.sampleID);

              const rootKey = effectiveInstGen.overridingRootKey !== undefined
                ? effectiveInstGen.overridingRootKey
                : sHeader.originalPitch;
              const coarseTune = (effectivePresetGen.coarseTune || 0) + (effectiveInstGen.coarseTune || 0);
              const fineTune = (effectivePresetGen.fineTune || 0) + (effectiveInstGen.fineTune || 0);
              const rawAttenuation = (effectivePresetGen.attenuation || 0) + (effectiveInstGen.attenuation || 0);
              // initialAttenuation is already expressed in centibels. Do not apply
              // the old EMU-specific 0.4 scaling: it made a 40 dB zone only 16 dB down.
              const attenuation = Math.max(0, Math.min(1440, rawAttenuation));
              const sampleModes = effectiveInstGen.sampleModes || 0;
              const instrumentScaleTuning = effectiveInstGen.scaleTuning !== undefined
                ? effectiveInstGen.scaleTuning
                : 100;
              const scaleTuning = Math.max(
                0,
                Math.min(1200, instrumentScaleTuning + (effectivePresetGen.scaleTuning || 0))
              );
              const pan = Math.max(
                -500,
                Math.min(500, (effectiveInstGen.pan || 0) + (effectivePresetGen.pan || 0))
              );

              const combinedGenerator = (name, instrumentDefault = 0) => {
                const instrumentValue = effectiveInstGen[name] !== undefined
                  ? effectiveInstGen[name]
                  : instrumentDefault;
                return instrumentValue + (effectivePresetGen[name] || 0);
              };
              const addressOffset = (fineName, coarseName) =>
                combinedGenerator(fineName, 0) + (combinedGenerator(coarseName, 0) * 32768);
              const startOffsetSamples = addressOffset('startAddrsOffset', 'startAddrsCoarseOffset');
              const endOffsetSamples = addressOffset('endAddrsOffset', 'endAddrsCoarseOffset');
              const startLoopOffsetSamples = addressOffset('startloopAddrsOffset', 'startloopAddrsCoarseOffset');
              const endLoopOffsetSamples = addressOffset('endloopAddrsOffset', 'endloopAddrsCoarseOffset');

              const volumeEnvelopeNames = [
                'delayVolEnv', 'attackVolEnv', 'holdVolEnv', 'decayVolEnv',
                'sustainVolEnv', 'releaseVolEnv', 'keynumToVolEnvHold',
                'keynumToVolEnvDecay'
              ];
              const hasVolumeEnvelope = volumeEnvelopeNames.some((name) =>
                effectivePresetGen[name] !== undefined || effectiveInstGen[name] !== undefined
              );
              const boundedTimecents = (name, defaultValue = -12000) => {
                if (effectivePresetGen[name] === -32768 || effectiveInstGen[name] === -32768) {
                  return -32768;
                }
                return Math.max(-12000, Math.min(8000, combinedGenerator(name, defaultValue)));
              };
              const volumeEnvelope = hasVolumeEnvelope ? {
                delayTimecents: boundedTimecents('delayVolEnv'),
                attackTimecents: boundedTimecents('attackVolEnv'),
                holdTimecents: boundedTimecents('holdVolEnv'),
                decayTimecents: boundedTimecents('decayVolEnv'),
                sustainCentibels: Math.max(0, Math.min(1440, combinedGenerator('sustainVolEnv', 0))),
                releaseTimecents: boundedTimecents('releaseVolEnv'),
                keyToHoldTimecents: Math.max(-1200, Math.min(1200, combinedGenerator('keynumToVolEnvHold', 0))),
                keyToDecayTimecents: Math.max(-1200, Math.min(1200, combinedGenerator('keynumToVolEnvDecay', 0)))
              } : null;

              const hasFilter = effectivePresetGen.initialFilterFc !== undefined ||
                effectiveInstGen.initialFilterFc !== undefined ||
                effectivePresetGen.initialFilterQ !== undefined ||
                effectiveInstGen.initialFilterQ !== undefined;
              const initialFilterFc = hasFilter
                ? Math.max(1500, Math.min(13500, combinedGenerator('initialFilterFc', 13500)))
                : null;
              const initialFilterQ = hasFilter
                ? Math.max(0, Math.min(960, combinedGenerator('initialFilterQ', 0)))
                : 0;

              zones.push({
                sampleIndex: iGen.sampleID,
                keyLow,
                keyHigh,
                velLow,
                velHigh,
                rootKey,
                coarseTune,
                fineTune,
                attenuation,
                sampleModes,
                scaleTuning,
                pan,
                startOffsetSamples,
                endOffsetSamples,
                startLoopOffsetSamples,
                endLoopOffsetSamples,
                volumeEnvelope,
                initialFilterFc,
                initialFilterQ,
                exclusiveClass: effectiveInstGen.exclusiveClass || 0,
                forcedKey: effectiveInstGen.forcedKey,
                forcedVelocity: effectiveInstGen.forcedVelocity,
                sampleLink: sHeader.sampleLink,
                sampleType: sHeader.sampleType
              });
            }
          }
        }
      }

      preset.sampleIndices = Array.from(sampleSet);
      preset.zones = zones;
    });

    console.log(`[SF2Parser] Vínculo de geradores SF2 concluído: ${this.presets.length} presets parsed com ${this.presets.reduce((acc, p) => acc + (p.zones ? p.zones.length : 0), 0)} zonas de sample.`);
  }
}

window.SoundFont2Parser = SoundFont2Parser;
