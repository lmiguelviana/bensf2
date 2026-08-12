/**
 * SOUNDFONT 2 (SF2) BINARY PARSER
 * Parser puro de arquivos binários SF2 em JavaScript para extração de amostras PCM e presets.
 */

class SoundFont2Parser {
  constructor(arrayBuffer) {
    this.buffer = arrayBuffer;
    this.view = new DataView(arrayBuffer);
    this.offset = 0;

    this.presets = [];
    this.sampleHeaders = [];
    this.sampleData = null;
  }

  cleanString(str) {
    if (!str) return 'Sem Nome';
    // Remover bytes nulos \0 e caracteres não imprimíveis ASCII
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
        // Amostras PCM de 16-bits
        const sampleCount = Math.floor(subSize / 2);
        this.sampleData = new Int16Array(this.buffer, this.offset, sampleCount);
        this.offset = nextSub;
      } else {
        this.offset = nextSub;
      }
    }
  }

  parsePdta(endOffset) {
    while (this.offset < endOffset - 8) {
      const subId = this.readFourCC();
      const subSize = this.readUint32();
      const nextSub = this.offset + subSize;

      if (subId === 'phdr') { // Preset Headers
        const count = Math.floor(subSize / 38);
        for (let i = 0; i < count - 1; i++) { // Último registro é EOP (End of Presets)
          const name = this.readString(20);
          const preset = this.readUint16();
          const bank = this.readUint16();
          const bagIdx = this.readUint16();
          const library = this.readUint32();
          const genre = this.readUint32();
          const morphology = this.readUint32();

          if (name && name !== 'EOP') {
            this.presets.push({ name: this.cleanString(name), preset, bank });
          }
        }
        this.offset = nextSub;
      } else if (subId === 'shdr') { // Sample Headers
        const count = Math.floor(subSize / 46);
        for (let i = 0; i < count - 1; i++) { // Último registro é EOS
          const name = this.readString(20);
          const start = this.readUint32();
          const end = this.readUint32();
          const startLoop = this.readUint32();
          const endLoop = this.readUint32();
          const sampleRate = this.readUint32();
          const originalPitch = this.readUint8();
          const pitchCorrection = this.readInt16();
          const sampleLink = this.readUint16();
          const sampleType = this.readUint16();

          if (name && name !== 'EOS') {
            this.sampleHeaders.push({
              name: this.cleanString(name), start, end, startLoop, endLoop, sampleRate, originalPitch
            });
          }
        }
        this.offset = nextSub;
      } else {
        this.offset = nextSub;
      }
    }
  }
}

window.SoundFont2Parser = SoundFont2Parser;
