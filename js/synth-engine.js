/**
 * POLYPHONIC WAVETABLE SYNTHESIZER ENGINE (OPTIMIZED WITH ZERO-LAG VOICE STEALING & STRICT AUDIO CLEANUP)
 * Motor de síntese de altíssimo desempenho com cancelamento imediato de vozes sobrepostas, prevenção de acúmulo de CPU e rampas suaves de áudio.
 */

class SynthEngine {
  constructor(audioEngineContext) {
    this.audioCtx = audioEngineContext;
    this.activeVoices = new Map();
    
    this.isAutoPolyphony = true;
    this.maxPolyphony = this.detectOptimalPolyphony(); 
    
    this.velocityCurve = 'normal';
    this.parsedSf2Data = null;
    this.decodedAudioBuffers = new Map();
    this.pitchBendSemi = new Map();

    this.adsr = {
      attack: 0.005,
      decay: 0.1,
      sustain: 0.75,
      release: 0.25
    };

    this.channels = {};
    this.initChannels();
  }

  detectOptimalPolyphony() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobile ? 24 : 48; // Limite otimizado para evitar estouro de buffers de áudio
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
        name: `CH ${ch < 10 ? '0' + ch : ch}: LAYER ${ch}`,
        gainNode: channelGain,
        pannerNode: panner,
        volume: 1.0,
        pan: 0.0,
        muted: false,
        solo: false,
        transpose: 0,
        semitoneTranspose: 0,
        adsr: { attack: 0.005, decay: 0.1, sustain: 0.75, release: 0.25 },
        assignedPresetIndex: 0,
        assignedMidiChannel: 'all',
        keyRangeLow: 0,
        keyRangeHigh: 127
      };

      this.pitchBendSemi.set(ch, 0);
    }
  }

  setChannelName(channel, name) {
    if (this.channels[channel]) {
      this.channels[channel].name = name.trim() || `CH ${channel < 10 ? '0' + channel : channel}`;
    }
  }

  attachFxRackToChannels(fxRack) {
    for (let ch = 1; ch <= 16; ch++) {
      const chConfig = this.channels[ch];
      if (chConfig && chConfig.gainNode && chConfig.pannerNode) {
        fxRack.connectChannelNode(ch, chConfig.gainNode, chConfig.pannerNode);
      }
    }
  }

  setMaxPolyphony(limitSetting) {
    if (limitSetting === 'auto') {
      this.isAutoPolyphony = true;
      this.maxPolyphony = this.detectOptimalPolyphony();
    } else {
      this.isAutoPolyphony = false;
      this.maxPolyphony = parseInt(limitSetting, 10) || 32;
    }
  }

  setVelocityCurve(curveType) {
    this.velocityCurve = curveType;
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
    this.stopAllVoices();
    this.parsedSf2Data = sf2ParsedObj;
    this.decodedAudioBuffers.clear();

    const ctx = this.audioCtx.init();

    if (sf2ParsedObj.sampleData && sf2ParsedObj.sampleHeaders) {
      sf2ParsedObj.sampleHeaders.forEach((sh, idx) => {
        if (sh.end > sh.start && sh.end <= sf2ParsedObj.sampleData.length) {
          const sampleLength = sh.end - sh.start;

          let validSampleRate = sh.sampleRate;
          if (!validSampleRate || validSampleRate < 3000 || validSampleRate > 768000 || isNaN(validSampleRate)) {
            validSampleRate = ctx.sampleRate || 44100;
          }

          const audioBuf = ctx.createBuffer(1, sampleLength, validSampleRate);
          const channelData = audioBuf.getChannelData(0);
          const pcmData = sf2ParsedObj.sampleData;

          for (let i = 0; i < sampleLength; i++) {
            channelData[i] = pcmData[sh.start + i] / 32768.0;
          }

          const hasLoop = sh.endLoop > sh.startLoop && sh.startLoop > sh.start;
          const loopStartSec = hasLoop ? (sh.startLoop - sh.start) / validSampleRate : 0;
          const loopEndSec = hasLoop ? (sh.endLoop - sh.start) / validSampleRate : 0;

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

    if (sf2ParsedObj.presets && sf2ParsedObj.presets.length > 0) {
      for (let ch = 1; ch <= 16; ch++) {
        this.channels[ch].assignedPresetIndex = (ch - 1) % sf2ParsedObj.presets.length;
      }
    }

    console.log(`[SynthEngine] Banco SF2 carregado com ${sf2ParsedObj.presets ? sf2ParsedObj.presets.length : 0} timbres atribuíveis.`);
  }

  setChannelPreset(channel, presetIndex) {
    if (this.channels[channel]) {
      this.channels[channel].assignedPresetIndex = parseInt(presetIndex, 10) || 0;
      console.log(`[SynthEngine] Canal ${channel} atribuído ao Timbre Preset #${presetIndex}`);
    }
  }

  setPitchBend(channel, semitones) {
    this.pitchBendSemi.set(channel, semitones);

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

  stopVoicesForNote(channel, note) {
    this.activeVoices.forEach((voice, key) => {
      if (voice.channel === channel && voice.note === note) {
        this.stopVoiceImmediate(key);
      }
    });
  }

  noteOn(note, velocity = 100, channel = 1) {
    if (this.decodedAudioBuffers.size === 0) {
      return;
    }

    const ctx = this.audioCtx.init();
    this.audioCtx.resume();

    for (let ch = 1; ch <= 16; ch++) {
      const chConfig = this.channels[ch];
      if (!chConfig || chConfig.muted) continue;

      const isMatchingChannel = chConfig.assignedMidiChannel === 'all' || chConfig.assignedMidiChannel === channel || ch === channel;
      if (!isMatchingChannel) continue;

      // Filtragem por Zona de Teclado (Split Min/Max)
      const lowLimit = chConfig.keyRangeLow !== undefined ? chConfig.keyRangeLow : 0;
      const highLimit = chConfig.keyRangeHigh !== undefined ? chConfig.keyRangeHigh : 127;
      if (note < lowLimit || note > highLimit) {
        continue;
      }

      const actualNote = Math.max(0, Math.min(127, note + (chConfig.transpose * 12) + (chConfig.semitoneTranspose || 0)));

      // Encerrar voz ativa anterior no mesmo canal e nota para evitar sobreposição/acúmulo
      this.stopVoicesForNote(ch, actualNote);

      // Controle de Polifonia estrito
      if (this.activeVoices.size >= this.maxPolyphony) {
        const oldestKey = this.activeVoices.keys().next().value;
        this.stopVoiceImmediate(oldestKey);
      }

      const now = ctx.currentTime;
      const gainNode = ctx.createGain();
      const velGain = this.calculateVelocityGain(velocity);

      const adsr = chConfig.adsr || this.adsr;
      const attackEnd = now + Math.max(0.001, adsr.attack);
      const decayEnd = attackEnd + Math.max(0.01, adsr.decay);
      const sustainLevel = Math.max(0.001, velGain * adsr.sustain);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.linearRampToValueAtTime(velGain, attackEnd);
      gainNode.gain.linearRampToValueAtTime(sustainLevel, decayEnd);

      let assignedSampleIndices = [];
      if (this.parsedSf2Data && this.parsedSf2Data.presets && this.parsedSf2Data.presets[chConfig.assignedPresetIndex]) {
        const presetObj = this.parsedSf2Data.presets[chConfig.assignedPresetIndex];
        if (presetObj.sampleIndices && presetObj.sampleIndices.length > 0) {
          assignedSampleIndices = presetObj.sampleIndices;
        }
      }

      if (assignedSampleIndices.length === 0) {
        assignedSampleIndices = Array.from(this.decodedAudioBuffers.keys());
      }

      let bestMatchedIdx = assignedSampleIndices[0];
      let minPitchDiff = 999;

      for (let i = 0; i < assignedSampleIndices.length; i++) {
        const sIdx = assignedSampleIndices[i];
        const sObj = this.decodedAudioBuffers.get(sIdx);
        if (sObj) {
          const diff = Math.abs(actualNote - sObj.originalPitch);
          if (diff < minPitchDiff) {
            minPitchDiff = diff;
            bestMatchedIdx = sIdx;
            if (diff === 0) break; // Encontrou afinação perfeita!
          }
        }
      }

      const sampleObj = this.decodedAudioBuffers.get(bestMatchedIdx);
      if (!sampleObj) continue;

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = sampleObj.audioBuffer;

      if (sampleObj.hasLoop) {
        sourceNode.loop = true;
        sourceNode.loopStart = sampleObj.loopStart;
        sourceNode.loopEnd = sampleObj.loopEnd;
      }

      const currentBend = this.pitchBendSemi.get(ch) || 0;
      const basePitch = sampleObj.originalPitch || 60;
      const totalNoteShift = (actualNote + currentBend) - basePitch;
      const pitchRatio = Math.pow(2, totalNoteShift / 12);
      sourceNode.playbackRate.value = pitchRatio;

      sourceNode.connect(gainNode);
      gainNode.connect(chConfig.gainNode);

      sourceNode.start(now);

      const voiceId = `v_${ch}_${actualNote}_${now}_${Math.random()}`;

      this.activeVoices.set(voiceId, {
        id: voiceId,
        sourceNode,
        gainNode,
        note: actualNote,
        channel: ch,
        originalPitch: basePitch,
        adsr: adsr,
        startTime: now,
        isReleasing: false,
        releaseTimeout: null
      });
    }
  }

  noteOff(note, channel = 1) {
    for (let ch = 1; ch <= 16; ch++) {
      const chConfig = this.channels[ch];
      if (!chConfig) continue;

      const isMatchingChannel = chConfig.assignedMidiChannel === 'all' || chConfig.assignedMidiChannel === channel || ch === channel;
      if (!isMatchingChannel) continue;

      const actualNote = Math.max(0, Math.min(127, note + (chConfig.transpose * 12) + (chConfig.semitoneTranspose || 0)));

      this.activeVoices.forEach((voice, voiceId) => {
        if (voice.channel === ch && voice.note === actualNote && !voice.isReleasing) {
          voice.isReleasing = true;

          const ctx = this.audioCtx.ctx;
          if (!ctx) {
            this.stopVoiceImmediate(voiceId);
            return;
          }

          const now = ctx.currentTime;
          const adsr = voice.adsr || chConfig.adsr || this.adsr;
          const releaseTime = Math.max(0.02, adsr.release || 0.25);
          const releaseEnd = now + releaseTime;

          try {
            voice.gainNode.gain.cancelScheduledValues(now);
            voice.gainNode.gain.setValueAtTime(Math.max(0.0001, voice.gainNode.gain.value), now);
            voice.gainNode.gain.linearRampToValueAtTime(0.0001, releaseEnd);
          } catch (e) {}

          const timeoutMs = Math.round((releaseTime * 1000) + 30);
          voice.releaseTimeout = setTimeout(() => {
            this.stopVoiceImmediate(voiceId);
          }, timeoutMs);
        }
      });
    }
  }

  stopVoiceImmediate(voiceKey) {
    const voice = this.activeVoices.get(voiceKey);
    if (voice) {
      if (voice.releaseTimeout) {
        clearTimeout(voice.releaseTimeout);
        voice.releaseTimeout = null;
      }
      try {
        voice.sourceNode.stop();
        voice.sourceNode.disconnect();
        voice.gainNode.disconnect();
      } catch (e) {}
      this.activeVoices.delete(voiceKey);
    }
  }

  stopAllVoices() {
    this.activeVoices.forEach((voice, key) => {
      this.stopVoiceImmediate(key);
    });
    this.activeVoices.clear();
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
