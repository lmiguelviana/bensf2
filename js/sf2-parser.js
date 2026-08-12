/**
 * SOUNDFONT 2 (SF2) BINARY PARSER
 * Decodificador de alta performance do formato de arquivo .sf2 em JavaScript nativo.
 */

class SoundFont2Parser {
  constructor(arrayBuffer) {
    this.buffer = arrayBuffer;
    this.dataView = new DataView(arrayBuffer);
    this.offset = 0;

    this.info = {};
    this.sampleData = null; // Uint8Array or Int16Array of raw PCM samples
    this.sampleHeaders = [];
    this.presets = [];
    this.instruments = [];
  }

  parse() {
    const riffHeader = this.readString(4);
    if (riffHeader !== 'RIFF') {
      throw new Error('Formato inválido: Cabeçalho RIFF não encontrado');
    }

    const fileSize = this.readUint32();
    const sfbkId = this.readString(4);
    if (sfbkId !== 'sfbk') {
      throw new Error('Formato inválido: ID sfbk não encontrado');
    }

    while (this.offset < this.buffer.byteLength) {
      if (this.offset + 8 > this.buffer.byteLength) break;
      const chunkId = this.readString(4);
      const chunkSize = this.readUint32();

      if (chunkId === 'LIST') {
        const listType = this.readString(4);
        const listEnd = this.offset + chunkSize - 4;

        if (listType === 'INFO') {
          this.parseInfoList(listEnd);
        } else if (listType === 'sdta') {
          this.parseSdtaList(listEnd);
        } else if (listType === 'pdta') {
          this.parsePdtaList(listEnd);
        } else {
          this.offset = listEnd;
        }
      } else {
        this.offset += chunkSize;
      }
      // Alinhamento de palavra em RIFF (word boundary alignment)
      if (this.offset % 2 !== 0) this.offset++;
    }

    console.log(`[SF2Parser] Decodificação concluída. Presets: ${this.presets.length}, Amostras: ${this.sampleHeaders.length}`);
    return {
      info: this.info,
      presets: this.presets,
      sampleHeaders: this.sampleHeaders,
      sampleData: this.sampleData
    };
  }

  parseInfoList(endOffset) {
    while (this.offset < endOffset) {
      const subId = this.readString(4);
      const subSize = this.readUint32();
      const strVal = this.readString(subSize);
      this.info[subId] = strVal.replace(/\0/g, '').trim();
      if (this.offset % 2 !== 0) this.offset++;
    }
  }

  parseSdtaList(endOffset) {
    while (this.offset < endOffset) {
      const subId = this.readString(4);
      const subSize = this.readUint32();
      if (subId === 'smpl') {
        // Amostras de áudio PCM de 16-bits
        this.sampleData = new Int16Array(this.buffer, this.offset, subSize / 2);
        this.offset += subSize;
      } else {
        this.offset += subSize;
      }
      if (this.offset % 2 !== 0) this.offset++;
    }
  }

  parsePdtaList(endOffset) {
    let pdtaSubchunks = {};
    while (this.offset < endOffset) {
      const subId = this.readString(4);
      const subSize = this.readUint32();
      const chunkOffset = this.offset;
      pdtaSubchunks[subId] = { offset: chunkOffset, size: subSize };
      this.offset += subSize;
      if (this.offset % 2 !== 0) this.offset++;
    }

    // Processar Sample Headers (shdr)
    if (pdtaSubchunks['shdr']) {
      this.parseSampleHeaders(pdtaSubchunks['shdr'].offset, pdtaSubchunks['shdr'].size);
    }

    // Processar Presets (phdr)
    if (pdtaSubchunks['phdr']) {
      this.parsePresetHeaders(pdtaSubchunks['phdr'].offset, pdtaSubchunks['phdr'].size);
    }
  }

  parseSampleHeaders(startOffset, size) {
    const count = size / 46;
    const oldOffset = this.offset;
    this.offset = startOffset;

    for (let i = 0; i < count - 1; i++) {
      const sampleName = this.readString(20).replace(/\0/g, '').trim();
      const start = this.readUint32();
      const end = this.readUint32();
      const startLoop = this.readUint32();
      const endLoop = this.readUint32();
      const sampleRate = this.readUint32();
      const originalPitch = this.readUint8();
      const pitchCorrection = this.readInt8();
      const sampleLink = this.readUint16();
      const sfSampleType = this.readUint16();

      this.sampleHeaders.push({
        name: sampleName || `Sample #${i+1}`,
        start,
        end,
        startLoop,
        endLoop,
        sampleRate: sampleRate || 44100,
        originalPitch: originalPitch || 60,
        pitchCorrection,
        sampleLink,
        sfSampleType
      });
    }
    this.offset = oldOffset;
  }

  parsePresetHeaders(startOffset, size) {
    const count = size / 38;
    const oldOffset = this.offset;
    this.offset = startOffset;

    for (let i = 0; i < count - 1; i++) {
      const name = this.readString(20).replace(/\0/g, '').trim();
      const presetNum = this.readUint16();
      const bank = this.readUint16();
      const presetBagIndex = this.readUint16();
      const library = this.readUint32();
      const genre = this.readUint32();
      const morphology = this.readUint32();

      this.presets.push({
        name: name || `Preset ${bank}:${presetNum}`,
        preset: presetNum,
        bank: bank,
        presetBagIndex
      });
    }
    this.offset = oldOffset;
  }

  readString(len) {
    let str = '';
    for (let i = 0; i < len; i++) {
      str += String.fromCharCode(this.dataView.getUint8(this.offset + i));
    }
    this.offset += len;
    return str;
  }

  readUint32() {
    const val = this.dataView.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readUint16() {
    const val = this.dataView.getUint16(this.offset, true);
    this.offset += 2;
    return val;
  }

  readUint8() {
    const val = this.dataView.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readInt8() {
    const val = this.dataView.getInt8(this.offset);
    this.offset += 1;
    return val;
  }
}

window.SoundFont2Parser = SoundFont2Parser;
