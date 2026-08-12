/**
 * POLYPHONIC WAVETABLE SYNTHESIZER ENGINE (MULTITIMBRIC WITH PER-TRACK FX & CUSTOM NAMES)
 * Processador de síntese polifônica com suporte a renomeação de faixas e preset persistence.
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
      attack: 0.01,
      decay: 0.1,
      sustain: 0.75,
      release: 0.25
    };

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
        name: `CH ${ch < 10 ? '0' + ch : ch}: LAYER ${ch}`,
        gainNode: channelGain,
        pannerNode: panner,
        volume: 1.0,
        pan: 0.0,
        muted: false,
        solo: false,
        transpose: 0,
        assignedPresetIndex: 0,
        assignedMidiChannel: ch
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

      const actualNote = Math.max(0, Math.min(127, note + (chConfig.transpose * 12)));
      const voiceKey = `${ch}_${note}`;

      if (this.activeVoices.has(voiceKey)) {
        this.stopVoiceImmediate(voiceKey);
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

      assignedSampleIndices.forEach((sIdx) => {
        const sObj = this.decodedAudioBuffers.get(sIdx);
        if (sObj) {
          const diff = Math.abs(actualNote - sObj.originalPitch);
          if (diff < minPitchDiff) {
            minPitchDiff = diff;
            bestMatchedIdx = sIdx;
          }
        }
      });

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

      this.activeVoices.set(voiceKey, {
        sourceNode,
        gainNode,
        note: actualNote,
        channel: ch,
        originalPitch: basePitch,
        startTime: now
      });
    }
  }

  noteOff(note, channel = 1) {
    for (let ch = 1; ch <= 16; ch++) {
      const chConfig = this.channels[ch];
      if (!chConfig) continue;

      const isMatchingChannel = chConfig.assignedMidiChannel === 'all' || chConfig.assignedMidiChannel === channel || ch === channel;
      if (!isMatchingChannel) continue;

      const voiceKey = `${ch}_${note}`;
      const voice = this.activeVoices.get(voiceKey);
      if (!voice) continue;

      const ctx = this.audioCtx.ctx;
      if (!ctx) continue;

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
