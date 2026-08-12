/**
 * POLYPHONIC WAVETABLE SYNTHESIZER ENGINE (OTIMIZADO COM GSD-SOUNDFONT-ENGINE)
 * Processador de síntese polifônica para reprodução de áudio SF2, envelopes ADSR, pontos de loop e Pitch Bend.
 */

class SynthEngine {
  constructor(audioEngineContext) {
    this.audioCtx = audioEngineContext;
    this.activeVoices = new Map(); // Key: `${channel}_${note}`, Value: voice object
    
    // Polifonia: Auto por padrão + Sobrescrita manual
    this.isAutoPolyphony = true;
    this.maxPolyphony = this.detectOptimalPolyphony(); 
    
    this.velocityCurve = 'normal'; // 'soft', 'normal', 'hard'
    this.parsedSf2Data = null;
    this.decodedAudioBuffers = new Map(); // SampleIndex -> { audioBuffer, loopStart, loopEnd, hasLoop }
    this.pitchBendSemi = new Map(); // channel -> semitones (-2 a +2)

    // Configuração ADSR Padrão
    this.adsr = {
      attack: 0.01,   // Segundos
      decay: 0.1,     // Segundos
      sustain: 0.75,  // Nível (0 a 1)
      release: 0.25   // Segundos
    };

    // Roteamento de Canais (1 a 16)
    this.channels = {};
    this.initChannels();
  }

  detectOptimalPolyphony() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobile ? 32 : 64;
  }

  initChannels() {
    const ctx = this.audioCtx.init();
    for (let ch = 1; ch <= 16; ch++) {
      const channelGain = ctx.createGain();
      channelGain.gain.value = 1.0;

      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = 0.0;
        channelGain.connect(panner);
        panner.connect(this.audioCtx.masterGain);
      } else {
        channelGain.connect(this.audioCtx.masterGain);
      }

      this.channels[ch] = {
        gainNode: channelGain,
        pannerNode: panner,
        volume: 1.0,
        pan: 0.0,
        muted: false,
        solo: false,
        transpose: 0,
        selectedPreset: null
      };

      this.pitchBendSemi.set(ch, 0);
    }
  }

  setMaxPolyphony(limitSetting) {
    if (limitSetting === 'auto') {
      this.isAutoPolyphony = true;
      this.maxPolyphony = this.detectOptimalPolyphony();
      console.log(`[SynthEngine] Polifonia Automática Ativada: ${this.maxPolyphony} vozes`);
    } else {
      this.isAutoPolyphony = false;
      this.maxPolyphony = parseInt(limitSetting, 10) || 32;
      console.log(`[SynthEngine] Polifonia Manual Ajustada: ${this.maxPolyphony} vozes`);
    }
  }

  setVelocityCurve(curveType) {
    this.velocityCurve = curveType;
    console.log(`[SynthEngine] Curva de velocidade ajustada para: ${this.velocityCurve}`);
  }

  calculateVelocityGain(velocity) {
    const normVel = Math.max(0, Math.min(127, velocity)) / 127.0;
    if (this.velocityCurve === 'soft') {
      return Math.pow(normVel, 1.2);
    } else if (this.velocityCurve === 'hard') {
      return Math.pow(normVel, 2.8);
    }
    return Math.pow(normVel, 2.0);
  }

  loadSoundFont(sf2ParsedObj) {
    this.parsedSf2Data = sf2ParsedObj;
    this.decodedAudioBuffers.clear();

    const ctx = this.audioCtx.init();

    if (sf2ParsedObj.sampleData && sf2ParsedObj.sampleHeaders) {
      sf2ParsedObj.sampleHeaders.forEach((sh, idx) => {
        if (sh.end > sh.start && sh.end <= sf2ParsedObj.sampleData.length) {
          const sampleLength = sh.end - sh.start;
          const audioBuf = ctx.createBuffer(1, sampleLength, sh.sampleRate || 44100);
          const channelData = audioBuf.getChannelData(0);
          const pcmData = sf2ParsedObj.sampleData;

          for (let i = 0; i < sampleLength; i++) {
            channelData[i] = pcmData[sh.start + i] / 32768.0;
          }

          // Extrair pontos de Loop para sustentação infinita sem corte de áudio
          const hasLoop = sh.endLoop > sh.startLoop && sh.startLoop > sh.start;
          const loopStartSec = hasLoop ? (sh.startLoop - sh.start) / sh.sampleRate : 0;
          const loopEndSec = hasLoop ? (sh.endLoop - sh.start) / sh.sampleRate : 0;

          this.decodedAudioBuffers.set(idx, {
            audioBuffer: audioBuf,
            hasLoop,
            loopStart: loopStartSec,
            loopEnd: loopEndSec,
            originalPitch: sh.originalPitch || 60
          });
        }
      });
    }

    console.log(`[SynthEngine] Banco SF2 carregado com ${this.decodedAudioBuffers.size} áudio buffers e suporte a Loop Points.`);
  }

  setPitchBend(channel, semitones) {
    this.pitchBendSemi.set(channel, semitones);

    // Atualizar vozes ativas deste canal em tempo real
    this.activeVoices.forEach((voice) => {
      if (voice.channel === channel && voice.sourceNode) {
        const basePitch = voice.originalPitch || 60;
        const totalNoteShift = (voice.note + semitones) - basePitch;
        const pitchRatio = Math.pow(2, totalNoteShift / 12);
        try {
          voice.sourceNode.playbackRate.setValueAtTime(pitchRatio, this.audioCtx.getCurrentTime());
        } catch (e) {}
      }
    });
  }

  noteOn(note, velocity = 100, channel = 1) {
    if (this.decodedAudioBuffers.size === 0) {
      return;
    }

    const ctx = this.audioCtx.init();
    this.audioCtx.resume();

    const chConfig = this.channels[channel] || this.channels[1];
    if (chConfig.muted) return;

    const actualNote = Math.max(0, Math.min(127, note + (chConfig.transpose * 12)));
    const voiceKey = `${channel}_${note}`;

    if (this.activeVoices.has(voiceKey)) {
      this.noteOff(note, channel);
    }

    if (this.activeVoices.size >= this.maxPolyphony) {
      const oldestKey = this.activeVoices.keys().next().value;
      this.stopVoiceImmediate(oldestKey);
    }

    const now = ctx.currentTime;
    const gainNode = ctx.createGain();
    const velGain = this.calculateVelocityGain(velocity);

    const attackEnd = now + this.adsr.attack;
    const decayEnd = attackEnd + this.adsr.decay;
    const sustainLevel = velGain * this.adsr.sustain;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(velGain, attackEnd);
    gainNode.gain.linearRampToValueAtTime(sustainLevel, decayEnd);

    const sampleIndices = Array.from(this.decodedAudioBuffers.keys());
    const matchedIdx = sampleIndices[actualNote % sampleIndices.length];
    const sampleObj = this.decodedAudioBuffers.get(matchedIdx);

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = sampleObj.audioBuffer;

    // Configurar Loop Points de Sustentação de Órgão/Strings se disponível no SF2
    if (sampleObj.hasLoop) {
      sourceNode.loop = true;
      sourceNode.loopStart = sampleObj.loopStart;
      sourceNode.loopEnd = sampleObj.loopEnd;
    }

    // Calcular afinação + Pitch Bend atual
    const currentBend = this.pitchBendSemi.get(channel) || 0;
    const basePitch = sampleObj.originalPitch || 60;
    const totalNoteShift = (actualNote + currentBend) - basePitch;
    const pitchRatio = Math.pow(2, totalNoteShift / 12);
    sourceNode.playbackRate.value = pitchRatio;

    sourceNode.connect(gainNode);
    gainNode.connect(chConfig.gainNode);

    sourceNode.start(now);

    this.activeVoices.set(voiceKey, {
      sourceNode,
      gainNode,
      note: actualNote,
      channel,
      originalPitch: basePitch,
      startTime: now
    });
  }

  noteOff(note, channel = 1) {
    const chConfig = this.channels[channel] || this.channels[1];
    const actualNote = Math.max(0, Math.min(127, note + (chConfig.transpose * 12)));
    const voiceKey = `${channel}_${note}`;

    const voice = this.activeVoices.get(voiceKey);
    if (!voice) return;

    const ctx = this.audioCtx.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const releaseEnd = now + this.adsr.release;

    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);

    setTimeout(() => {
      try {
        voice.sourceNode.stop();
        voice.sourceNode.disconnect();
        voice.gainNode.disconnect();
      } catch (e) {}
    }, this.adsr.release * 1000 + 50);

    this.activeVoices.delete(voiceKey);
  }

  stopVoiceImmediate(voiceKey) {
    const voice = this.activeVoices.get(voiceKey);
    if (voice) {
      try {
        voice.sourceNode.stop();
        voice.sourceNode.disconnect();
        voice.gainNode.disconnect();
      } catch (e) {}
      this.activeVoices.delete(voiceKey);
    }
  }

  setChannelVolume(channel, volume) {
    if (this.channels[channel]) {
      this.channels[channel].volume = volume;
      this.channels[channel].gainNode.gain.setTargetAtTime(volume, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setChannelPan(channel, panValue) {
    if (this.channels[channel] && this.channels[channel].pannerNode) {
      this.channels[channel].pan = panValue;
      this.channels[channel].pannerNode.pan.setTargetAtTime(panValue, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setChannelMute(channel, muted) {
    if (this.channels[channel]) {
      this.channels[channel].muted = muted;
      const targetGain = muted ? 0 : this.channels[channel].volume;
      this.channels[channel].gainNode.gain.setTargetAtTime(targetGain, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  getActiveVoicesCount() {
    return this.activeVoices.size;
  }
}

window.SynthEngine = SynthEngine;
