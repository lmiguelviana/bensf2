/**
 * BEN SF2 LOW-LATENCY AUDIO WORKLET DSP ENGINE
 * Processador de áudio dedicado de ultrabaixa latência (sub-5ms) para renderização de síntese de voz e interpolação de amostras em tempo real.
 */

class BenAudioWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    this.sampleRateVal = 44100;

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
      channel: data.channel || 1,
      note: data.note || 60,
      velocity: data.velocity || 100,
      gain: data.gain || 0.8,
      pitchRatio: data.pitchRatio || 1.0,
      buffer: data.sampleBuffer || null,
      readIndex: 0,
      loopStart: data.loopStart || 0,
      loopEnd: data.loopEnd || 0,
      isLooping: data.isLooping || false,
      active: true,
      release: false,
      releaseGain: 1.0
    };

    this.voices.push(voice);
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
    const rightChannel = output[1] || output[0];
    const numSamples = leftChannel.length;

    // Limpar buffers de saída
    for (let i = 0; i < numSamples; i++) {
      leftChannel[i] = 0;
      rightChannel[i] = 0;
    }

    // Processar todas as vozes ativas em lote
    for (let vIdx = this.voices.length - 1; vIdx >= 0; vIdx--) {
      const voice = this.voices[vIdx];
      if (!voice.active || !voice.buffer) continue;

      const samplesData = voice.buffer;
      const totalLen = samplesData.length;

      for (let s = 0; s < numSamples; s++) {
        if (voice.readIndex >= totalLen) {
          if (voice.isLooping && voice.loopEnd > voice.loopStart) {
            voice.readIndex = voice.loopStart;
          } else {
            voice.active = false;
            break;
          }
        }

        const idxFloor = Math.floor(voice.readIndex);
        const frac = voice.readIndex - idxFloor;
        const nextIdx = (idxFloor + 1 < totalLen) ? idxFloor + 1 : idxFloor;

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
        rightChannel[s] += outVal;

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
