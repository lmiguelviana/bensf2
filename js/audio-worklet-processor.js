/**
 * BEN SF2 EXPERIMENTAL AUDIO WORKLET DSP ENGINE
 * Este processador não faz parte do caminho de áudio padrão até ser integrado e validado.
 */

class BenAudioWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    this.sampleRateVal = typeof sampleRate === 'number' ? sampleRate : 44100;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'noteOn') {
        this.handleNoteOn(msg);
      } else if (msg.type === 'noteOff') {
        this.handleNoteOff(msg);
      } else if (msg.type === 'allNotesOff') {
        this.voices = [];
      } else if (msg.type === 'setSampleRate') {
        this.sampleRateVal = msg.sampleRate || 44100;
      }
    };
  }

  handleNoteOn(data) {
    const voice = {
      channel: data.channel ?? 1,
      note: data.note ?? 60,
      velocity: data.velocity ?? 100,
      gain: data.gain ?? 0.8,
      pitchRatio: data.pitchRatio ?? 1.0,
      buffer: data.sampleBuffer || null,
      readIndex: 0,
      loopStart: data.loopStart ?? 0,
      loopEnd: data.loopEnd ?? 0,
      isLooping: data.isLooping || false,
      active: true,
      release: false,
      releaseGain: 1.0
    };

    if (voice.buffer && typeof voice.buffer.length === 'number' && voice.buffer.length > 0) {
      this.voices.push(voice);
    }
  }

  handleNoteOff(data) {
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.channel === data.channel && v.note === data.note && !v.release) {
        v.release = true;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const leftChannel = output[0];
    const rightChannel = output[1] || null;
    const numSamples = leftChannel.length;

    // Limpar buffers de saída
    for (let i = 0; i < numSamples; i++) {
      leftChannel[i] = 0;
      if (rightChannel) rightChannel[i] = 0;
    }

    // Processar todas as vozes ativas em lote
    for (let vIdx = this.voices.length - 1; vIdx >= 0; vIdx--) {
      const voice = this.voices[vIdx];
      if (!voice.active || !voice.buffer) {
        this.voices.splice(vIdx, 1);
        continue;
      }

      const samplesData = voice.buffer;
      const totalLen = samplesData.length;
      const loopStart = Math.max(0, Math.min(totalLen - 1, Math.floor(voice.loopStart)));
      const loopEnd = Math.max(loopStart + 1, Math.min(totalLen, Math.floor(voice.loopEnd)));
      const validLoop = voice.isLooping && loopEnd > loopStart;

      for (let s = 0; s < numSamples; s++) {
        if (validLoop && voice.readIndex >= loopEnd) {
          voice.readIndex = loopStart + ((voice.readIndex - loopStart) % (loopEnd - loopStart));
        } else if (voice.readIndex >= totalLen) {
          voice.active = false;
          break;
        }

        const idxFloor = Math.floor(voice.readIndex);
        const frac = voice.readIndex - idxFloor;
        const nextIdx = validLoop && idxFloor + 1 >= loopEnd
          ? loopStart
          : ((idxFloor + 1 < totalLen) ? idxFloor + 1 : idxFloor);

        // Interpolação Linear de Amostras
        const s1 = samplesData[idxFloor];
        const s2 = samplesData[nextIdx];
        let sampleVal = s1 + frac * (s2 - s1);

        if (voice.release) {
          voice.releaseGain -= 0.002;
          if (voice.releaseGain <= 0) {
            voice.active = false;
            break;
          }
          sampleVal *= voice.releaseGain;
        }

        const outVal = sampleVal * voice.gain;
        leftChannel[s] += outVal;
        if (rightChannel) rightChannel[s] += outVal;

        voice.readIndex += voice.pitchRatio;
      }

      if (!voice.active) {
        this.voices.splice(vIdx, 1);
      }
    }

    return true;
  }
}

registerProcessor('ben-audio-worklet-processor', BenAudioWorkletProcessor);
