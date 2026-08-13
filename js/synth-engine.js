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
    this.globalVelocitySettings = {
      mode: 'normal',
      minVel: 1,
      maxVel: 127,
      curvePower: 2.0,
      fixedVel: 120
    };
    this.onVelocityTrigger = null;
    this.velocityListeners = new Set();

    this.parsedSf2Data = null;
    this.decodedAudioBuffers = new Map();
    this.nextSampleIndex = 0;
    // Direct/UI bend remains track-scoped. Physical MIDI expression is kept
    // separately by source/channel so omni tracks do not merge performers.
    this.pitchBendSemi = new Map();
    this.midiPitchBendSemi = new Map();
    this.midiModulation = new Map();
    this.channelModulation = new Map();
    this.voiceSequence = 0;
    this.voiceStealFadeSeconds = 0.004;

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
    return isMobile ? 24 : 64; // Otimizado: 24 mobile, 64 desktop
  }

  initChannels() {
    const ctx = this.audioCtx.init(); // Garante que ctx e masterGain estão inicializados
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
        soloSuppressed: false,
        transpose: 0,
        semitoneTranspose: 0,
        adsr: { attack: 0.005, decay: 0.1, sustain: 0.75, release: 0.25 },
        // Canal 1 começa com preset 0; canais 2+ sem timbre até o usuário escolher
        assignedPresetIndex: ch === 1 ? 0 : null,
        assignedMidiChannel: 'all',
        keyRangeLow: 0,
        keyRangeHigh: 127,
        velocitySettings: {
          useGlobal: true,
          mode: 'normal',
          minVel: 1,
          maxVel: 127,
          curvePower: 2.0,
          fixedVel: 120
        }
      };

      this.pitchBendSemi.set(ch, 0);
      this.channelModulation.set(ch, 0);
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
      const parsed = parseInt(limitSetting, 10);
      this.maxPolyphony = Number.isFinite(parsed) ? Math.max(1, parsed) : 32;
    }
  }

  setVelocityCurve(curveType) {
    this.velocityCurve = curveType;
    if (this.globalVelocitySettings) {
      this.globalVelocitySettings.mode = curveType;
    }
  }

  getVelocitySettings(channel = 1, settingsOverride = null) {
    if (settingsOverride) return settingsOverride;
    const chConfig = this.channels[channel];
    return (!chConfig || !chConfig.velocitySettings || chConfig.velocitySettings.useGlobal)
      ? this.globalVelocitySettings
      : chConfig.velocitySettings;
  }

  calculateVelocityResponse(velocity, channel = 1, settingsOverride = null) {
    const settings = this.getVelocitySettings(channel, settingsOverride) || this.globalVelocitySettings;
    const numericInput = Number(velocity);
    const inputVelocity = Math.max(1, Math.min(127,
      Math.round(Number.isFinite(numericInput) ? numericInput : 1)));

    const parsedMin = Number(settings.minVel);
    const parsedMax = Number(settings.maxVel);
    let minV = Math.max(1, Math.min(127, Number.isFinite(parsedMin) ? parsedMin : 1));
    let maxV = Math.max(1, Math.min(127, Number.isFinite(parsedMax) ? parsedMax : 127));
    if (minV > maxV) [minV, maxV] = [maxV, minV];

    if (settings.mode === 'fixed') {
      const parsedFixed = Number(settings.fixedVel);
      const effectiveVelocity = Math.max(1, Math.min(127,
        Math.round(Number.isFinite(parsedFixed) ? parsedFixed : 120)));
      const fixedNorm = effectiveVelocity / 127.0;
      return {
        inputVelocity,
        effectiveVelocity,
        gain: Math.pow(fixedNorm, 2.0)
      };
    }

    const clampedVel = Math.max(minV, Math.min(maxV, inputVelocity));
    const normVel = clampedVel / 127.0;

    let gain = 1.0;
    if (settings.mode === 'soft') {
      gain = Math.pow(normVel, 1.2);
    } else if (settings.mode === 'hard') {
      gain = Math.pow(normVel, 2.8);
    } else if (settings.mode === 'compressed') {
      gain = 0.3 + (0.7 * Math.pow(normVel, 1.5));
    } else if (settings.mode === 'custom') {
      const p = settings.curvePower !== undefined ? settings.curvePower : 2.0;
      gain = Math.pow(normVel, p);
    } else {
      gain = Math.pow(normVel, 2.0); // Normal
    }

    // O velocity efetivo dirige tanto o volume quanto a selecao da camada SF2.
    // sqrt() converte a curva de amplitude para o dominio MIDI, preservando a
    // sonoridade das curvas existentes sem escolher um sample de outra dinamica.
    const effectiveVelocity = Math.max(1, Math.min(127, Math.round(Math.sqrt(gain) * 127)));

    return { inputVelocity, effectiveVelocity, gain };
  }

  calculateEffectiveVelocity(velocity, channel = 1, settingsOverride = null) {
    return this.calculateVelocityResponse(velocity, channel, settingsOverride).effectiveVelocity;
  }

  addVelocityListener(listener) {
    if (typeof listener !== 'function') return () => {};
    this.velocityListeners.add(listener);
    return () => this.velocityListeners.delete(listener);
  }

  emitVelocityTrigger(channel, inputVelocity, effectiveVelocity) {
    if (this.onVelocityTrigger) {
      this.onVelocityTrigger(channel, inputVelocity, effectiveVelocity);
    }
    this.velocityListeners.forEach((listener) => {
      try {
        listener(channel, inputVelocity, effectiveVelocity);
      } catch (error) {
        console.warn('[SynthEngine] Listener de velocity falhou:', error);
      }
    });
  }

  calculateVelocityGain(velocity, channel = 1, settingsOverride = null) {
    const response = this.calculateVelocityResponse(velocity, channel, settingsOverride);

    this.emitVelocityTrigger(channel, response.inputVelocity, response.effectiveVelocity);

    return response.gain;
  }

  loadSoundFont(sf2ParsedObj, fileName = 'SoundFont') {
    if ((sf2ParsedObj.sampleHeaders || []).some((header) => header.isCompressed)) {
      throw new Error('SF3 comprimido não é suportado por este motor. Converta o banco para SF2 PCM antes de carregar.');
    }

    this.stopAllVoices();

    if (!this.parsedSf2Data) {
      this.parsedSf2Data = { presets: [] };
    }
    if (!this.parsedSf2Data.presets) {
      this.parsedSf2Data.presets = [];
    }

    const ctx = this.audioCtx.init();

    // Reserve o namespace pelo número declarado de headers, inclusive os inválidos/silenciosos.
    // Derivar o offset apenas dos buffers decodificados permite que outro banco reutilize lacunas.
    const sampleHeaders = Array.isArray(sf2ParsedObj.sampleHeaders)
      ? sf2ParsedObj.sampleHeaders
      : [];
    const sampleOffset = this.nextSampleIndex;
    this.nextSampleIndex += sampleHeaders.length;
    const remapSampleLink = (sampleLink, sampleType) => {
      const baseType = (sampleType || 0) & 0x0f;
      const isLinkedType = baseType === 2 || baseType === 4 || baseType === 8;
      return isLinkedType && Number.isInteger(sampleLink) &&
        sampleLink >= 0 && sampleLink < sampleHeaders.length
        ? sampleOffset + sampleLink
        : sampleLink;
    };

    if (sf2ParsedObj.sampleData && sampleHeaders.length > 0) {
      const zonesBySample = new Map();
      (sf2ParsedObj.presets || []).forEach((preset) => {
        (preset.zones || []).forEach((zone) => {
          if (!Number.isInteger(zone.sampleIndex)) return;
          if (!zonesBySample.has(zone.sampleIndex)) zonesBySample.set(zone.sampleIndex, []);
          zonesBySample.get(zone.sampleIndex).push(zone);
        });
      });

      sampleHeaders.forEach((sh, idx) => {
        if (sh.end > sh.start && sh.end <= sf2ParsedObj.sampleData.length) {
          const sampleZones = zonesBySample.get(idx) || [];
          const offsetValue = (zone, key) => {
            const numeric = Number(zone && zone[key]);
            return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
          };
          let decodeStart = sh.start;
          let decodeEnd = sh.end;
          sampleZones.forEach((zone) => {
            decodeStart = Math.min(
              decodeStart,
              sh.start + offsetValue(zone, 'startOffsetSamples'),
              sh.startLoop + offsetValue(zone, 'startLoopOffsetSamples')
            );
            decodeEnd = Math.max(
              decodeEnd,
              sh.end + offsetValue(zone, 'endOffsetSamples'),
              sh.endLoop + offsetValue(zone, 'endLoopOffsetSamples')
            );
          });
          decodeStart = Math.max(0, Math.min(sf2ParsedObj.sampleData.length, decodeStart));
          decodeEnd = Math.max(decodeStart, Math.min(sf2ParsedObj.sampleData.length, decodeEnd));
          const sampleLength = decodeEnd - decodeStart;
          if (sampleLength <= 0) return;

          let validSampleRate = sh.sampleRate;
          if (!validSampleRate || validSampleRate < 3000 || validSampleRate > 768000 || isNaN(validSampleRate)) {
            validSampleRate = ctx.sampleRate || 44100;
          }

          const audioBuf = ctx.createBuffer(1, sampleLength, validSampleRate);
          const channelData = audioBuf.getChannelData(0);
          const pcmData = sf2ParsedObj.sampleData;
          const pcmLowBytes = sf2ParsedObj.sampleData24;

          for (let i = 0; i < sampleLength; i++) {
            const sampleIndex = decodeStart + i;
            if (pcmLowBytes && sampleIndex < pcmLowBytes.length) {
              const signed24 = (pcmData[sampleIndex] << 8) | pcmLowBytes[sampleIndex];
              channelData[i] = signed24 / 8388608.0;
            } else {
              channelData[i] = pcmData[sampleIndex] / 32768.0;
            }
          }

          const hasLoop = sh.endLoop > sh.startLoop &&
            sh.startLoop >= sh.start && sh.endLoop <= sh.end;
          const loopStartSec = hasLoop ? (sh.startLoop - decodeStart) / validSampleRate : 0;
          const loopEndSec = hasLoop ? (sh.endLoop - decodeStart) / validSampleRate : 0;

          const globalSampleIdx = sampleOffset + idx;
          this.decodedAudioBuffers.set(globalSampleIdx, {
            audioBuffer: audioBuf,
            hasLoop,
            loopStart: loopStartSec,
            loopEnd: loopEndSec,
            sampleRate: validSampleRate,
            decodedStartSample: decodeStart,
            baseStartSample: sh.start - decodeStart,
            baseEndSample: sh.end - decodeStart,
            baseLoopStartSample: sh.startLoop - decodeStart,
            baseLoopEndSample: sh.endLoop - decodeStart,
            originalPitch: sh.originalPitch !== undefined ? sh.originalPitch : 60,
            sampleLink: remapSampleLink(sh.sampleLink, sh.sampleType),
            sampleType: sh.sampleType,
            fineTuningSemitones: sh.fineTuningSemitones || 0  // pitchCorrection em semitones fracionários
          });
        }
      });
    }

    // Mapear e acumular os novos presets no banco global de timbres
    const cleanFileName = fileName.replace(/\.sf2$/i, '');
    if (sf2ParsedObj.presets && sf2ParsedObj.presets.length > 0) {
      sf2ParsedObj.presets.forEach((p) => {
        const mappedSampleIndices = (p.sampleIndices || []).map(sIdx => sampleOffset + sIdx);
        const mappedZones = Array.isArray(p.zones)
          ? p.zones.map(z => ({
            ...z,
            sampleIndex: sampleOffset + z.sampleIndex,
            sampleLink: remapSampleLink(z.sampleLink, z.sampleType)
          }))
          : undefined;
        this.parsedSf2Data.presets.push({
          ...p,
          sampleIndices: mappedSampleIndices,
          ...(mappedZones === undefined ? {} : { zones: mappedZones }),
          sf2Source: cleanFileName
        });
      });
    }

    // Apenas se o canal 1 ainda não tiver timbre atribuído, atribuir o primeiro
    if (this.channels[1].assignedPresetIndex === null && this.parsedSf2Data.presets.length > 0) {
      this.channels[1].assignedPresetIndex = 0;
    }

    console.log(`[SynthEngine] Banco SF2 "${cleanFileName}" carregado. Total de timbres na biblioteca: ${this.parsedSf2Data.presets.length}.`);
    return this.parsedSf2Data.presets;
  }

  setChannelPreset(channel, presetIndex) {
    if (this.channels[channel]) {
      // Usar parseInt mas preservar 0 (não usar || 0 que colapsa 0 para falsy)
      const parsed = parseInt(presetIndex, 10);
      this.channels[channel].assignedPresetIndex = Number.isFinite(parsed) ? parsed : null;
      console.log(`[SynthEngine] Canal ${channel} atribuído ao Timbre Preset #${parsed}`);
    }
  }

  setPitchBend(channel, semitones) {
    // Suporte a 'all': aplica em todos os canais ativos
    if (channel === 'all') {
      for (let ch = 1; ch <= 16; ch++) {
        this.pitchBendSemi.set(ch, semitones);
      }
    } else {
      this.pitchBendSemi.set(channel, semitones);
    }

    this.activeVoices.forEach((voice) => {
      const matches = (channel === 'all') || (voice.channel === channel);
      if (matches && voice.sourceNode) {
        const sourceBend = voice.triggerType === 'midi'
          ? this.getMidiExpressionValue(
            this.midiPitchBendSemi,
            voice.inputMidiChannel,
            voice.sourceId,
            0
          )
          : 0;
        const bendForVoice = (this.pitchBendSemi.get(voice.channel) || 0) + sourceBend;
        const pitchRatio = voice.basePlaybackRate * Math.pow(2, bendForVoice / 12);
        try {
          voice.sourceNode.playbackRate.setValueAtTime(pitchRatio, this.audioCtx.getCurrentTime());
        } catch (e) {}
      }
    });
  }

  getTracksForMidiChannel(midiChannel) {
    if (midiChannel === 'all') {
      return Array.from({ length: 16 }, (_, index) => index + 1);
    }

    const parsedChannel = parseInt(midiChannel, 10);
    if (!Number.isFinite(parsedChannel) || parsedChannel < 1 || parsedChannel > 16) {
      return [];
    }

    const tracks = [];
    for (let ch = 1; ch <= 16; ch++) {
      const chConfig = this.channels[ch];
      if (!chConfig) continue;
      const assigned = chConfig.assignedMidiChannel;
      if (assigned === 'all' || parseInt(assigned, 10) === parsedChannel) {
        tracks.push(ch);
      }
    }
    return tracks;
  }

  setMidiPitchBend(midiChannel, semitones, sourceId = null) {
    const parsedChannel = parseInt(midiChannel, 10);
    if (!Number.isFinite(parsedChannel)) return;
    const bend = Number.isFinite(Number(semitones)) ? Number(semitones) : 0;
    if (!sourceId) {
      this.getTracksForMidiChannel(parsedChannel).forEach((track) => {
        this.pitchBendSemi.set(track, bend);
      });
    } else {
      this.midiPitchBendSemi.set(sourceId, bend);
    }

    this.activeVoices.forEach((voice) => {
      if (voice.triggerType !== 'midi') return;
      if (sourceId ? voice.sourceId !== sourceId : voice.inputMidiChannel !== parsedChannel) return;
      const effectiveBend = sourceId
        ? (this.pitchBendSemi.get(voice.channel) || 0) + bend
        : bend;
      try {
        voice.sourceNode.playbackRate.setValueAtTime(
          voice.basePlaybackRate * Math.pow(2, effectiveBend / 12),
          this.audioCtx.getCurrentTime()
        );
      } catch (e) {}
    });
  }

  getMidiExpressionValue(store, midiChannel, sourceId, fallback = 0) {
    if (sourceId && store.has(sourceId)) return store.get(sourceId);
    const channelKey = `midi-channel:${midiChannel}`;
    return store.has(channelKey) ? store.get(channelKey) : fallback;
  }

  ensureVoiceModulationNodes(voice) {
    if (!voice || voice.modulationOscillatorNode || !voice.sourceNode || !voice.sourceNode.detune) return;
    const ctx = this.audioCtx.ctx;
    if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') return;
    try {
      const oscillator = ctx.createOscillator();
      const depth = ctx.createGain();
      oscillator.frequency.value = 5;
      depth.gain.value = 0;
      oscillator.connect(depth);
      depth.connect(voice.sourceNode.detune);
      oscillator.start(ctx.currentTime);
      voice.modulationOscillatorNode = oscillator;
      voice.modulationGainNode = depth;
    } catch (e) {}
  }

  applyVoiceModulation(voice, amount) {
    const normalized = Math.max(0, Math.min(1, Number(amount) || 0));
    voice.modulationAmount = normalized;
    if (normalized > 0) this.ensureVoiceModulationNodes(voice);
    if (voice.modulationGainNode) {
      try {
        // Explicit default CC1 destination: 5 Hz vibrato, up to +/- 50 cents.
        voice.modulationGainNode.gain.setTargetAtTime(
          normalized * 50,
          this.audioCtx.getCurrentTime(),
          0.01
        );
      } catch (e) {}
    }
  }

  refreshVoiceModulation(voice) {
    const sourceAmount = voice.triggerType === 'midi'
      ? this.getMidiExpressionValue(
        this.midiModulation,
        voice.inputMidiChannel,
        voice.sourceId,
        0
      )
      : 0;
    this.applyVoiceModulation(
      voice,
      Math.max(this.channelModulation.get(voice.channel) || 0, sourceAmount)
    );
  }

  setMidiModulation(midiChannel, normalizedAmount, sourceId = null) {
    const parsedChannel = parseInt(midiChannel, 10);
    if (!Number.isFinite(parsedChannel)) return;
    const amount = Math.max(0, Math.min(1, Number(normalizedAmount) || 0));
    const sourceKey = sourceId || `midi-channel:${parsedChannel}`;
    this.midiModulation.set(sourceKey, amount);
    this.activeVoices.forEach((voice) => {
      if (voice.triggerType !== 'midi') return;
      if (sourceId ? voice.sourceId !== sourceId : voice.inputMidiChannel !== parsedChannel) return;
      this.refreshVoiceModulation(voice);
    });
  }

  setChannelModulation(channel, normalizedAmount) {
    const amount = Math.max(0, Math.min(1, Number(normalizedAmount) || 0));
    const tracks = channel === 'all'
      ? Array.from({ length: 16 }, (_, index) => index + 1)
      : [parseInt(channel, 10)];
    tracks.forEach((track) => {
      if (!this.channels[track]) return;
      this.channelModulation.set(track, amount);
      this.activeVoices.forEach((voice) => {
        if (voice.channel === track) this.refreshVoiceModulation(voice);
      });
    });
  }

  setMidiChannelVolume(midiChannel, volume) {
    this.getTracksForMidiChannel(midiChannel).forEach((track) => {
      this.setChannelVolume(track, volume);
    });
  }

  resolveVoiceIdentity(note, midiChannel, directTrack, identity = null) {
    const supplied = typeof identity === 'string' ? { ownerId: identity } : (identity || {});
    if (directTrack !== null) {
      return {
        ownerId: supplied.ownerId || `direct:${directTrack}:note:${note}`,
        sourceId: supplied.sourceId || `direct-track:${directTrack}`
      };
    }
    return {
      ownerId: supplied.ownerId || `midi-channel:${midiChannel}:note:${note}`,
      sourceId: supplied.sourceId || `midi-channel:${midiChannel}`
    };
  }

  stopVoicesForNote(channel, note, ownerId = null) {
    this.activeVoices.forEach((voice, key) => {
      if (voice.channel === channel && voice.note === note &&
          (ownerId === null || voice.ownerId === ownerId)) {
        this.stopVoiceImmediate(key);
      }
    });
  }

  stopVoicesForExclusiveClass(channel, exclusiveClass) {
    if (!exclusiveClass) return;
    this.activeVoices.forEach((voice, key) => {
      if (voice.channel === channel && voice.exclusiveClass === exclusiveClass) {
        this.stopVoiceImmediate(key);
      }
    });
  }

  reservePolyphonySlots(requestedVoices) {
    const requested = Math.max(0, Math.min(this.maxPolyphony, requestedVoices));
    while (this.activeVoices.size + requested > this.maxPolyphony) {
      const oldestKey = this.activeVoices.keys().next().value;
      if (oldestKey === undefined) break;
      this.stopVoiceImmediate(oldestKey);
    }
    return requested;
  }

  getZonePlaybackWindow(sampleObj, zone) {
    const numericOffset = (key) => {
      const value = Number(zone && zone[key]);
      return Number.isFinite(value) ? Math.trunc(value) : 0;
    };
    const bufferLength = sampleObj.audioBuffer.length || sampleObj.baseEndSample || 0;
    const startSample = Math.max(0, Math.min(bufferLength,
      sampleObj.baseStartSample + numericOffset('startOffsetSamples')));
    const endSample = Math.max(0, Math.min(bufferLength,
      sampleObj.baseEndSample + numericOffset('endOffsetSamples')));
    const loopStartSample = Math.max(0, Math.min(bufferLength,
      sampleObj.baseLoopStartSample + numericOffset('startLoopOffsetSamples')));
    const loopEndSample = Math.max(0, Math.min(bufferLength,
      sampleObj.baseLoopEndSample + numericOffset('endLoopOffsetSamples')));
    const sampleRate = sampleObj.sampleRate || 44100;
    const hasLoop = endSample > startSample && loopEndSample > loopStartSample &&
      loopStartSample >= startSample && loopEndSample <= endSample;
    return {
      valid: endSample > startSample,
      startSeconds: startSample / sampleRate,
      durationSeconds: Math.max(0, (endSample - startSample) / sampleRate),
      loopStartSeconds: loopStartSample / sampleRate,
      loopEndSeconds: loopEndSample / sampleRate,
      hasLoop
    };
  }

  timecentsToSeconds(timecents) {
    if (timecents === -32768) return 0;
    const numeric = Number(timecents);
    if (!Number.isFinite(numeric)) return 0;
    return Math.pow(2, numeric / 1200);
  }

  getVoiceEnvelope(zone, adsr, playedKey) {
    if (zone.volumeEnvelope) {
      const env = zone.volumeEnvelope;
      const delayTc = Number(env.delayTimecents ?? -12000);
      const attackTc = Number(env.attackTimecents ?? -12000);
      const rawHoldTc = Number(env.holdTimecents ?? -12000);
      const rawDecayTc = Number(env.decayTimecents ?? -12000);
      const holdTc = rawHoldTc === -32768 ? -32768 : rawHoldTc +
        (Number(env.keyToHoldTimecents ?? 0) * (60 - playedKey));
      const decayTc = rawDecayTc === -32768 ? -32768 : rawDecayTc +
        (Number(env.keyToDecayTimecents ?? 0) * (60 - playedKey));
      const releaseTc = Number(env.releaseTimecents ?? -12000);
      return {
        delay: this.timecentsToSeconds(delayTc),
        attack: this.timecentsToSeconds(attackTc),
        hold: this.timecentsToSeconds(holdTc),
        decay: this.timecentsToSeconds(decayTc),
        sustainRatio: Math.pow(10, -Math.max(0, Number(env.sustainCentibels ?? 0)) / 200),
        release: this.timecentsToSeconds(releaseTc),
        source: 'sf2'
      };
    }
    return {
      delay: 0,
      attack: Math.max(0.001, Number(adsr.attack ?? 0.005)),
      hold: 0,
      decay: Math.max(0.001, Number(adsr.decay ?? 0.1)),
      sustainRatio: Math.max(0, Math.min(1, Number(adsr.sustain ?? 0.75))),
      release: Math.max(0.001, Number(adsr.release ?? 0.25)),
      source: 'track'
    };
  }

  absoluteCentsToHz(cents) {
    return 8.176 * Math.pow(2, Number(cents) / 1200);
  }

  noteOnTrack(note, velocity = 100, track = 1) {
    this.noteOn(note, velocity, track, track);
  }

  noteOffTrack(note, track = 1) {
    this.noteOff(note, track, track);
  }

  noteOn(note, velocity = 100, channel = 1, directTrack = null, identity = null) {
    const numericVelocity = Number(velocity);
    if (!Number.isFinite(numericVelocity) || numericVelocity <= 0) {
      this.noteOff(note, channel, directTrack, identity);
      return;
    }
    if (this.decodedAudioBuffers.size === 0) {
      return;
    }

    const ctx = this.audioCtx.init();
    this.audioCtx.resume();
    const parsedDirectTrack = directTrack === null ? null : parseInt(directTrack, 10);
    const parsedMidiChannel = parseInt(channel, 10);
    const voiceIdentity = this.resolveVoiceIdentity(note, parsedMidiChannel, parsedDirectTrack, identity);
    const targetTracks = parsedDirectTrack === null
      ? this.getTracksForMidiChannel(parsedMidiChannel)
      : [parsedDirectTrack];

    for (let ch = 1; ch <= 16; ch++) {
      const chConfig = this.channels[ch];
      if (!chConfig || chConfig.muted) continue;

      if (!targetTracks.includes(ch)) continue;

      // Pular canal se não houver timbre atribuído
      if (chConfig.assignedPresetIndex === null || chConfig.assignedPresetIndex === undefined) continue;

      // Filtragem por Zona de Teclado (Split Min/Max)
      const lowLimit = chConfig.keyRangeLow !== undefined ? chConfig.keyRangeLow : 0;
      const highLimit = chConfig.keyRangeHigh !== undefined ? chConfig.keyRangeHigh : 127;
      if (note < lowLimit || note > highLimit) {
        continue;
      }

      const actualNote = Math.max(0, Math.min(127, note + (chConfig.transpose * 12) + (chConfig.semitoneTranspose || 0)));

      const now = ctx.currentTime;
      const velocityResponse = this.calculateVelocityResponse(velocity, ch);
      const effectiveVelocity = velocityResponse.effectiveVelocity;
      const velGain = Math.min(0.85, velocityResponse.gain);
      this.emitVelocityTrigger(ch, velocityResponse.inputVelocity, effectiveVelocity);

      const presetObj = (this.parsedSf2Data && this.parsedSf2Data.presets)
        ? this.parsedSf2Data.presets[chConfig.assignedPresetIndex]
        : null;

      // Filtrar Zonas de Sample pelo KeyRange e VelocityRange do SF2
      let matchingZones = [];
      if (presetObj && Array.isArray(presetObj.zones)) {
        matchingZones = presetObj.zones.filter(z =>
          actualNote >= z.keyLow && actualNote <= z.keyHigh &&
          effectiveVelocity >= z.velLow && effectiveVelocity <= z.velHigh
        );
      }

      // Fallback apenas para bancos legados que não possuem a propriedade zones.
      // Um array vazio é um resultado SF2 válido e deve permanecer silencioso.
      const hasZonesProperty = Boolean(
        presetObj && Object.prototype.hasOwnProperty.call(presetObj, 'zones')
      );
      if (matchingZones.length === 0 && presetObj && !hasZonesProperty) {
        const assignedSampleIndices = (presetObj && presetObj.sampleIndices && presetObj.sampleIndices.length > 0)
          ? presetObj.sampleIndices
          : Array.from(this.decodedAudioBuffers.keys());
        const defaultSampleIdx = assignedSampleIndices[0] !== undefined ? assignedSampleIndices[0] : 0;
        matchingZones = [{
          sampleIndex: defaultSampleIdx,
          keyLow: 0, keyHigh: 127, velLow: 0, velHigh: 127,
          rootKey: 60, coarseTune: 0, fineTune: 0, attenuation: 0, sampleModes: 0,
          scaleTuning: 100, pan: 0
        }];
      }

      const playableZones = matchingZones.map((zone) => {
        const sampleObj = this.decodedAudioBuffers.get(zone.sampleIndex);
        if (!sampleObj) return null;
        const playbackWindow = this.getZonePlaybackWindow(sampleObj, zone);
        return playbackWindow.valid ? { zone, sampleObj, playbackWindow } : null;
      }).filter(Boolean);
      if (playableZones.length === 0) continue;

      this.stopVoicesForNote(ch, actualNote, voiceIdentity.ownerId);
      new Set(playableZones.map((entry) => entry.zone.exclusiveClass).filter(Boolean))
        .forEach((exclusiveClass) => this.stopVoicesForExclusiveClass(ch, exclusiveClass));
      const zonesToPlay = playableZones.slice(0, this.reservePolyphonySlots(playableZones.length));
      const adsr = chConfig.adsr || this.adsr;

      // Tocar cada zona de sample correspondente (suporta Stereo e Multi-velocity)
      zonesToPlay.forEach(({ zone: z, sampleObj, playbackWindow }) => {

        const sourceNode = ctx.createBufferSource();
        sourceNode.buffer = sampleObj.audioBuffer;

        const sampleMode = z.sampleModes || 0;
        if (playbackWindow.hasLoop && (sampleMode === 1 || sampleMode === 3)) {
          sourceNode.loop = true;
          sourceNode.loopStart = playbackWindow.loopStartSeconds;
          sourceNode.loopEnd = playbackWindow.loopEndSeconds;
        }

        // Cálculo de Afinação Exato do SF2: actualNote - rootKey + coarseTune + fineTune (cents / 100)
        const trackBend = this.pitchBendSemi.get(ch) || 0;
        const currentBend = parsedDirectTrack === null
          ? trackBend + this.getMidiExpressionValue(
            this.midiPitchBendSemi,
            parsedMidiChannel,
            voiceIdentity.sourceId,
            0
          )
          : trackBend;
        const rootKey = (z.rootKey !== undefined && z.rootKey >= 0)
          ? z.rootKey
          : (sampleObj.originalPitch !== undefined ? sampleObj.originalPitch : 60);
        const fineTuneCents = (z.fineTune || 0) + ((sampleObj.fineTuningSemitones || 0) * 100);
        const scaleTuning = z.scaleTuning !== undefined ? z.scaleTuning : 100;
        const playedKey = z.forcedKey !== undefined ? z.forcedKey : actualNote;
        const keyTrackingCents = (playedKey - rootKey) * scaleTuning;
        const baseNoteShift = (keyTrackingCents / 100.0) + (z.coarseTune || 0) + (fineTuneCents / 100.0);
        const basePlaybackRate = Math.pow(2, baseNoteShift / 12.0);
        const pitchRatio = basePlaybackRate * Math.pow(2, currentBend / 12.0);
        sourceNode.playbackRate.value = pitchRatio;

        // Atenuação do SF2 em centibels (cB) -> dB -> linear gain factor: 10^(-cB / 200)
        const cB = z.attenuation || 0;
        const attenuationGain = Math.pow(10, -cB / 200.0);
        const zoneVelocityGain = z.forcedVelocity !== undefined
          ? Math.min(0.85, this.calculateVelocityResponse(z.forcedVelocity, ch).gain)
          : velGain;

        // Ganho final por voz (max 0.8 para dar headroom e evitar distorção)
        const voiceGain = Math.min(0.8, zoneVelocityGain * attenuationGain);
        const envelope = this.getVoiceEnvelope(z, adsr, playedKey);
        const delayEnd = now + envelope.delay;
        const attackEnd = delayEnd + Math.max(0.001, envelope.attack);
        const holdEnd = attackEnd + envelope.hold;
        const decayEnd = holdEnd + Math.max(0.001, envelope.decay);
        const sustainLevel = Math.max(0.0001, voiceGain * envelope.sustainRatio);

        const voiceGainNode = ctx.createGain();
        voiceGainNode.gain.setValueAtTime(0.0001, now);
        if (delayEnd > now) voiceGainNode.gain.setValueAtTime(0.0001, delayEnd);
        voiceGainNode.gain.linearRampToValueAtTime(voiceGain, attackEnd);
        if (holdEnd > attackEnd) voiceGainNode.gain.setValueAtTime(voiceGain, holdEnd);
        voiceGainNode.gain.linearRampToValueAtTime(sustainLevel, decayEnd);

        sourceNode.connect(voiceGainNode);
        const voiceFilterNode = (z.initialFilterFc !== null && z.initialFilterFc !== undefined &&
          typeof ctx.createBiquadFilter === 'function') ? ctx.createBiquadFilter() : null;
        if (voiceFilterNode) {
          voiceFilterNode.type = 'lowpass';
          voiceFilterNode.frequency.value = Math.max(20, Math.min(
            (ctx.sampleRate || 44100) * 0.45,
            this.absoluteCentsToHz(z.initialFilterFc)
          ));
          voiceFilterNode.Q.value = Math.max(0.0001, Math.min(
            30,
            Math.pow(10, (z.initialFilterQ || 0) / 200) / Math.SQRT2
          ));
          voiceGainNode.connect(voiceFilterNode);
        }
        const voicePannerNode = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        const voiceOutputNode = voiceFilterNode || voiceGainNode;
        if (voicePannerNode) {
          const pan = Math.max(-500, Math.min(500, z.pan || 0));
          voicePannerNode.pan.value = pan / 500;
          voiceOutputNode.connect(voicePannerNode);
          voicePannerNode.connect(chConfig.gainNode);
        } else {
          voiceOutputNode.connect(chConfig.gainNode);
        }

        const voiceId = `v_${ch}_${actualNote}_${++this.voiceSequence}`;

        const voice = {
          id: voiceId,
          sourceNode,
          gainNode: voiceGainNode,
          filterNode: voiceFilterNode,
          pannerNode: voicePannerNode,
          note: actualNote,
          playedKey,
          channel: ch,
          inputNote: note,
          inputMidiChannel: parsedDirectTrack === null ? parsedMidiChannel : null,
          inputTrack: parsedDirectTrack,
          triggerType: parsedDirectTrack === null ? 'midi' : 'direct',
          ownerId: voiceIdentity.ownerId,
          sourceId: voiceIdentity.sourceId,
          exclusiveClass: z.exclusiveClass || 0,
          originalPitch: rootKey,
          basePlaybackRate,
          sampleMode,
          adsr,
          envelope,
          startTime: now,
          isReleasing: false,
          releaseTimeout: null,
          modulationOscillatorNode: null,
          modulationGainNode: null,
          modulationAmount: 0
        };
        this.activeVoices.set(voiceId, voice);
        this.refreshVoiceModulation(voice);
        sourceNode.onended = () => {
          this.cleanupVoice(voiceId, false);
        };
        if (sourceNode.loop) {
          sourceNode.start(now, playbackWindow.startSeconds);
        } else {
          sourceNode.start(now, playbackWindow.startSeconds, playbackWindow.durationSeconds);
        }
      });
    }
  }

  noteOff(note, channel = 1, directTrack = null, identity = null) {
    const parsedDirectTrack = directTrack === null ? null : parseInt(directTrack, 10);
    const parsedMidiChannel = parseInt(channel, 10);
    const voiceIdentity = identity === null
      ? null
      : this.resolveVoiceIdentity(note, parsedMidiChannel, parsedDirectTrack, identity);
    let foundCapturedDestination = false;

    this.activeVoices.forEach((voice, voiceId) => {
      const isDirectMatch = parsedDirectTrack !== null &&
        voice.triggerType === 'direct' &&
        voice.inputTrack === parsedDirectTrack &&
        voice.inputNote === note &&
        (!voiceIdentity || voice.ownerId === voiceIdentity.ownerId);
      const isMidiMatch = parsedDirectTrack === null &&
        voice.triggerType === 'midi' &&
        voice.inputMidiChannel === parsedMidiChannel &&
        voice.inputNote === note &&
        (!voiceIdentity || voice.ownerId === voiceIdentity.ownerId);

      if (isDirectMatch || isMidiMatch) {
        foundCapturedDestination = true;
        this.releaseVoice(voiceId);
      }
    });

    // Compatibilidade com vozes antigas que possam ter sido criadas antes da
    // captura de identidade (por exemplo, durante hot reload no Electron).
    if (!foundCapturedDestination && !voiceIdentity) {
      const targetTracks = parsedDirectTrack !== null
        ? [parsedDirectTrack]
        : this.getTracksForMidiChannel(parsedMidiChannel);
      targetTracks.forEach((ch) => {
        const chConfig = this.channels[ch];
        if (!chConfig) return;
        const actualNote = Math.max(0, Math.min(127,
          note + (chConfig.transpose * 12) + (chConfig.semitoneTranspose || 0)));
        this.activeVoices.forEach((voice, voiceId) => {
          if (voice.channel === ch && voice.note === actualNote && !voice.isReleasing) {
            this.releaseVoice(voiceId);
          }
        });
      });
    }
  }

  releaseVoice(voiceId) {
    const voice = this.activeVoices.get(voiceId);
    if (!voice || voice.isReleasing) return;
    voice.isReleasing = true;

    if (voice.sampleMode === 3 && voice.sourceNode) {
      voice.sourceNode.loop = false;
    }

    const ctx = this.audioCtx.ctx;
    if (!ctx) {
      this.stopVoiceImmediate(voiceId);
      return;
    }

    const now = ctx.currentTime;
    const chConfig = this.channels[voice.channel];
    const adsr = voice.adsr || (chConfig && chConfig.adsr) || this.adsr;
    const releaseTime = Math.max(0.001,
      voice.envelope ? voice.envelope.release : Number(adsr.release ?? 0.25));
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

  cleanupVoice(voiceKey, shouldStopSource = false) {
    const voice = this.activeVoices.get(voiceKey);
    if (!voice) return;

    // Remova primeiro: stop() pode disparar onended sincronicamente em alguns harnesses.
    this.activeVoices.delete(voiceKey);
    if (voice.releaseTimeout) {
      clearTimeout(voice.releaseTimeout);
      voice.releaseTimeout = null;
    }

    if (shouldStopSource) {
      try {
        voice.sourceNode.stop();
      } catch (e) {}
    }

    try { voice.sourceNode.disconnect(); } catch (e) {}
    try { voice.gainNode.disconnect(); } catch (e) {}
    if (voice.filterNode) {
      try { voice.filterNode.disconnect(); } catch (e) {}
    }
    if (voice.pannerNode) {
      try { voice.pannerNode.disconnect(); } catch (e) {}
    }
    if (voice.modulationOscillatorNode) {
      try { voice.modulationOscillatorNode.stop(); } catch (e) {}
      try { voice.modulationOscillatorNode.disconnect(); } catch (e) {}
    }
    if (voice.modulationGainNode) {
      try { voice.modulationGainNode.disconnect(); } catch (e) {}
    }
  }

  stopVoiceImmediate(voiceKey) {
    const voice = this.activeVoices.get(voiceKey);
    if (!voice) return;
    const ctx = this.audioCtx.ctx;
    if (!ctx || !voice.gainNode || !voice.gainNode.gain) {
      this.cleanupVoice(voiceKey, true);
      return;
    }
    const now = ctx.currentTime;
    const fadeEnd = now + this.voiceStealFadeSeconds;
    voice.isReleasing = true;
    try {
      voice.gainNode.gain.cancelScheduledValues(now);
      voice.gainNode.gain.setValueAtTime(Math.max(0.0001, voice.gainNode.gain.value), now);
      voice.gainNode.gain.linearRampToValueAtTime(0.0001, fadeEnd);
      voice.sourceNode.stop(fadeEnd);
    } catch (e) {
      this.cleanupVoice(voiceKey, true);
      return;
    }
    // Free the logical polyphony slot immediately, while Web Audio completes
    // the 4 ms anti-click fade on the already scheduled nodes.
    this.activeVoices.delete(voiceKey);
    if (voice.releaseTimeout) clearTimeout(voice.releaseTimeout);
    voice.releaseTimeout = setTimeout(() => {
      try { voice.sourceNode.disconnect(); } catch (e) {}
      try { voice.gainNode.disconnect(); } catch (e) {}
      if (voice.filterNode) try { voice.filterNode.disconnect(); } catch (e) {}
      if (voice.pannerNode) try { voice.pannerNode.disconnect(); } catch (e) {}
      if (voice.modulationOscillatorNode) {
        try { voice.modulationOscillatorNode.stop(); } catch (e) {}
        try { voice.modulationOscillatorNode.disconnect(); } catch (e) {}
      }
      if (voice.modulationGainNode) try { voice.modulationGainNode.disconnect(); } catch (e) {}
    }, Math.ceil(this.voiceStealFadeSeconds * 1000) + 10);
  }

  stopAllVoices() {
    Array.from(this.activeVoices.keys()).forEach((key) => this.stopVoiceImmediate(key));
  }

  allNotesOff() {
    this.stopAllVoices();
  }

  setChannelVolume(channel, volume) {
    if (this.channels[channel]) {
      this.channels[channel].volume = volume;
      this.applyChannelGain(channel);
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
      this.applyChannelGain(channel);
    }
  }

  setChannelSoloSuppressed(channel, suppressed) {
    if (!this.channels[channel]) return;
    this.channels[channel].soloSuppressed = Boolean(suppressed);
    this.applyChannelGain(channel);
  }

  applyChannelGain(channel) {
    const chConfig = this.channels[channel];
    if (!chConfig || !chConfig.gainNode) return;
    const effectiveGain = chConfig.muted || chConfig.soloSuppressed ? 0 : chConfig.volume;
    chConfig.gainNode.gain.setTargetAtTime(effectiveGain, this.audioCtx.getCurrentTime(), 0.01);
  }

  getActiveVoicesCount() {
    return this.activeVoices.size;
  }
}

window.SynthEngine = SynthEngine;
