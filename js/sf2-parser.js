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

  parse() {
    const riff = this.readFourCC();
    if (riff !== 'RIFF') {
      throw new Error('Arquivo SF2 inválido: Cabeçalho RIFF não encontrado.');
    }

    const fileSize = this.readUint32();
    const sfbk = this.readFourCC();
    if (sfbk !== 'sfbk') {
      throw new Error('Arquivo SF2 inválido: Recipiente sfbk não encontrado.');
    }

    while (this.offset < this.buffer.byteLength - 8) {
      const chunkId = this.readFourCC();
      const chunkSize = this.readUint32();
      const nextChunkOffset = this.offset + chunkSize;

      if (chunkId === 'LIST') {
        const listType = this.readFourCC();
        if (listType === 'sdta') {
          this.parseSdta(nextChunkOffset);
        } else if (listType === 'pdta') {
          this.parsePdta(nextChunkOffset);
        } else {
          this.offset = nextChunkOffset;
        }
      } else {
        this.offset = nextChunkOffset;
      }
    }

    this.linkPresetsToSamples();

    return {
      presets: this.presets,
      sampleHeaders: this.sampleHeaders,
      sampleData: this.sampleData
    };
  }

  parseSdta(endOffset) {
    while (this.offset < endOffset - 8) {
      const subId = this.readFourCC();
      const subSize = this.readUint32();
      const nextSub = this.offset + subSize;

      if (subId === 'smpl') {
        const sampleCount = Math.floor(subSize / 2);
        this.sampleData = new Int16Array(this.buffer, this.offset, sampleCount);
        this.offset = nextSub;
      } else {
        this.offset = nextSub;
      }
    }
  }

  parsePdta(endOffset) {
    let phdrRaw = [];

    while (this.offset < endOffset - 8) {
      const subId = this.readFourCC();
      const subSize = this.readUint32();
      const nextSub = this.offset + subSize;

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
        this.offset = nextSub;
      } else if (subId === 'pbag') {
        const count = Math.floor(subSize / 4);
        for (let i = 0; i < count; i++) {
          this.pbag.push({ genNdx: this.readUint16(), modNdx: this.readUint16() });
        }
        this.offset = nextSub;
      } else if (subId === 'pgen') {
        const count = Math.floor(subSize / 4);
        for (let i = 0; i < count; i++) {
          this.pgen.push({ oper: this.readUint16(), amount: this.readUint16() });
        }
        this.offset = nextSub;
      } else if (subId === 'inst') {
        const count = Math.floor(subSize / 22);
        for (let i = 0; i < count; i++) {
          this.inst.push({ name: this.readString(20), bagNdx: this.readUint16() });
        }
        this.offset = nextSub;
      } else if (subId === 'ibag') {
        const count = Math.floor(subSize / 4);
        for (let i = 0; i < count; i++) {
          this.ibag.push({ genNdx: this.readUint16(), modNdx: this.readUint16() });
        }
        this.offset = nextSub;
      } else if (subId === 'igen') {
        const count = Math.floor(subSize / 4);
        for (let i = 0; i < count; i++) {
          this.igen.push({ oper: this.readUint16(), amount: this.readUint16() });
        }
        this.offset = nextSub;
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

          // Validação de Afinação Original (Original Pitch): Se estiver fora de 12..108, utilizar 60 (Dó Central - C4)
          const validPitch = (rawPitch >= 12 && rawPitch <= 108) ? rawPitch : 60;

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
              sampleType,
              isCompressed
            });
          }
        }
        this.offset = nextSub;
      } else {
        this.offset = nextSub;
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

  linkPresetsToSamples() {
    const totalSamples = this.sampleHeaders.length;
    if (totalSamples === 0) return;

    this.presets.forEach((preset, presetIdx) => {
      const sampleSet = new Set();

      for (let b = preset.bagStart; b < preset.bagEnd && b < this.pbag.length; b++) {
        const bag = this.pbag[b];
        const nextGenNdx = this.pbag[b + 1] ? this.pbag[b + 1].genNdx : this.pgen.length;

        for (let g = bag.genNdx; g < nextGenNdx && g < this.pgen.length; g++) {
          const gen = this.pgen[g];
          if (gen.oper === 41) { // Generator 41 = Instrument ID
            const instIdx = gen.amount;
            if (this.inst[instIdx]) {
              const instObj = this.inst[instIdx];
              const nextInstBag = this.inst[instIdx + 1] ? this.inst[instIdx + 1].bagNdx : this.ibag.length;

              for (let ib = instObj.bagNdx; ib < nextInstBag && ib < this.ibag.length; ib++) {
                const ibagObj = this.ibag[ib];
                const nextIgenNdx = this.ibag[ib + 1] ? this.ibag[ib + 1].genNdx : this.igen.length;

                for (let ig = ibagObj.genNdx; ig < nextIgenNdx && ig < this.igen.length; ig++) {
                  const igenObj = this.igen[ig];
                  if (igenObj.oper === 53) { // Generator 53 = Sample ID
                    if (igenObj.amount < totalSamples) {
                      sampleSet.add(igenObj.amount);
                    }
                  }
                }
              }
            }
          }
        }
      }

      preset.sampleIndices = Array.from(sampleSet);

      // Fallback Inteligente: Se o preset não tiver vinculo explícito por geradores, particionar amostras proporcionalmente!
      if (preset.sampleIndices.length === 0) {
        const samplesPerPreset = Math.max(1, Math.floor(totalSamples / this.presets.length));
        const startIdx = Math.min(totalSamples - 1, presetIdx * samplesPerPreset);
        const endIdx = Math.min(totalSamples, startIdx + samplesPerPreset);

        for (let s = startIdx; s < endIdx; s++) {
          preset.sampleIndices.push(s);
        }
      }
    });

    console.log(`[SF2Parser] Vínculo concluído: ${this.presets.length} presets mapeados para ${totalSamples} amostras de áudio.`);
  }
}

window.SoundFont2Parser = SoundFont2Parser;
