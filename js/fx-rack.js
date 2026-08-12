/**
 * MASTER & PER-TRACK FX RACK ENGINE (COM TODOS OS EFEITOS DESLIGADOS POR PADRÃO)
 * Módulo de processamento de efeitos com Master FX Global, FX por pista individual e Filtro Cutoff (Começam OFF por padrão).
 */

class FxRackManager {
  constructor(audioEngineContext) {
    this.audioCtx = audioEngineContext;

    // Modos de Reverb inspirados nos Algoritmos clássicos da Valhalla DSP
    this.reverbModes = {
      'concert_hall': { name: '🏛️ Concert Hall', duration: 3.5, decay: 2.2, damping: 6000, preDelay: 0.03 },
      'bright_hall':  { name: '🌟 Bright Hall',  duration: 3.0, decay: 1.8, damping: 12000, preDelay: 0.02 },
      'plate':        { name: '🛡️ Vintage Plate', duration: 2.0, decay: 2.8, damping: 14000, preDelay: 0.01 },
      'room':         { name: '🏠 Acoustic Room', duration: 0.9, decay: 3.5, damping: 4500, preDelay: 0.005 },
      'chamber':      { name: '🎙️ Studio Chamber', duration: 1.6, decay: 2.5, damping: 8000, preDelay: 0.015 },
      'cathedral':    { name: '⛪ Holy Cathedral', duration: 5.5, decay: 1.5, damping: 5000, preDelay: 0.04 },
      'sanctuary':    { name: '🌌 Sanctuary Space', duration: 4.2, decay: 1.8, damping: 7000, preDelay: 0.025 },
      'synth_space':  { name: '🪐 Synth Space',   duration: 4.8, decay: 1.6, damping: 10000, preDelay: 0.035 }
    };

    // Master FX Nodes (Saída Geral) - DESLIGADOS POR PADRÃO
    this.masterEqLow = null;
    this.masterEqMid = null;
    this.masterEqHigh = null;
    this.masterDelayNode = null;
    this.masterDelayGain = null;
    this.masterReverbNode = null;
    this.masterReverbGain = null;

    this.masterEqEnabled = false;
    this.masterDelayEnabled = false;
    this.masterReverbEnabled = false;

    this.masterParams = {
      eqLow: 0, eqMid: 0, eqHigh: 0,
      delayTime: 300, delayMix: 20,
      reverbSize: 40, reverbMix: 25,
      reverbMode: 'concert_hall'
    };

    // Per-Channel FX Nodes & State (Ch 1 a 16)
    this.channelFx = new Map();
    this.selectedChannel = 1;
    this.onSelectionChangeCallbacks = [];
  }

  init() {
    const ctx = this.audioCtx.init();

    // 1. Inicializar Master FX Nodes (Gains em 0 por padrão)
    this.masterEqLow = ctx.createBiquadFilter();
    this.masterEqLow.type = 'lowshelf';
    this.masterEqLow.frequency.value = 100;
    this.masterEqLow.gain.value = 0;

    this.masterEqMid = ctx.createBiquadFilter();
    this.masterEqMid.type = 'peaking';
    this.masterEqMid.frequency.value = 1000;
    this.masterEqMid.Q.value = 1.0;
    this.masterEqMid.gain.value = 0;

    this.masterEqHigh = ctx.createBiquadFilter();
    this.masterEqHigh.type = 'highshelf';
    this.masterEqHigh.frequency.value = 8000;
    this.masterEqHigh.gain.value = 0;

    this.masterEqLow.connect(this.masterEqMid);
    this.masterEqMid.connect(this.masterEqHigh);

    this.masterDelayNode = ctx.createDelay();
    this.masterDelayNode.delayTime.value = 0.3;
    const masterDelayFeedback = ctx.createGain();
    masterDelayFeedback.gain.value = 0.3;
    this.masterDelayGain = ctx.createGain();
    this.masterDelayGain.gain.value = 0.0; // OFF por padrão

    this.masterDelayNode.connect(masterDelayFeedback);
    masterDelayFeedback.connect(this.masterDelayNode);
    this.masterDelayNode.connect(this.masterDelayGain);

    this.masterReverbNode = ctx.createConvolver();
    this.masterReverbNode.buffer = this.createSyntheticImpulse(ctx, this.reverbModes['concert_hall']);
    this.masterReverbGain = ctx.createGain();
    this.masterReverbGain.gain.value = 0.0; // OFF por padrão
    this.masterReverbNode.connect(this.masterReverbGain);

    if (this.audioCtx.masterGain && this.audioCtx.limiterNode) {
      this.audioCtx.masterGain.disconnect();
      this.audioCtx.masterGain.connect(this.masterEqLow);
      this.masterEqHigh.connect(this.audioCtx.limiterNode);

      this.masterEqHigh.connect(this.masterDelayNode);
      this.masterDelayGain.connect(this.audioCtx.limiterNode);

      this.masterEqHigh.connect(this.masterReverbNode);
      this.masterReverbGain.connect(this.audioCtx.limiterNode);
    }

    // 2. Inicializar Nódulos de Efeito para cada um dos 16 canais (DESLIGADOS POR PADRÃO)
    for (let ch = 1; ch <= 16; ch++) {
      const cutoffFilter = ctx.createBiquadFilter();
      cutoffFilter.type = 'lowpass';
      cutoffFilter.frequency.value = 20000;
      cutoffFilter.Q.value = 1.0;

      const eqLow = ctx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 100;
      eqLow.gain.value = 0;

      const eqMid = ctx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.value = 1000;
      eqMid.Q.value = 1.0;
      eqMid.gain.value = 0;

      const eqHigh = ctx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 8000;
      eqHigh.gain.value = 0;

      cutoffFilter.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);

      const delayNode = ctx.createDelay();
      delayNode.delayTime.value = 0.3;

      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.3;

      const delayGain = ctx.createGain();
      delayGain.gain.value = 0.0; // OFF por padrão

      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayNode.connect(delayGain);

      const reverbNode = ctx.createConvolver();
      reverbNode.buffer = this.createSyntheticImpulse(ctx, this.reverbModes['concert_hall']);

      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.0; // OFF por padrão

      reverbNode.connect(reverbGain);

      eqHigh.connect(delayNode);
      eqHigh.connect(reverbNode);

      this.channelFx.set(ch, {
        cutoffFilter,
        eqLow,
        eqMid,
        eqHigh,
        delayNode,
        delayGain,
        reverbNode,
        reverbGain,
        params: {
          cutoffEnabled: false,
          cutoffFreq: 20000,
          eqEnabled: false,
          delayEnabled: false,
          reverbEnabled: false,
          eqLow: 0,
          eqMid: 0,
          eqHigh: 0,
          delayTime: 300,
          delayMix: 20,
          reverbSize: 40,
          reverbMix: 25,
          reverbMode: 'concert_hall'
        }
      });
    }

    console.log('[FxRack] Motor de Efeitos Master e Canais inicializados (TODOS OS EFEITOS DESLIGADOS POR PADRÃO).');
  }

  // Gerador de Resposta de Impulso Sintético estilo Valhalla DSP
  createSyntheticImpulse(ctx, modeConfig) {
    const duration = modeConfig.duration || 3.0;
    const decay = modeConfig.decay || 2.0;
    const damping = modeConfig.damping || 8000;
    const preDelay = modeConfig.preDelay || 0.02;

    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const preDelaySamples = Math.floor(sampleRate * preDelay);
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const dt = 1.0 / sampleRate;
    const RC = 1.0 / (2 * Math.PI * damping);
    const alpha = dt / (RC + dt);

    let lastLeft = 0;
    let lastRight = 0;

    for (let i = 0; i < length; i++) {
      if (i < preDelaySamples) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }

      const n = (i - preDelaySamples) / (length - preDelaySamples);
      const env = Math.pow(1 - n, decay);
      
      const rawLeft = (Math.random() * 2 - 1) * env;
      const rawRight = (Math.random() * 2 - 1) * env;

      lastLeft = lastLeft + alpha * (rawLeft - lastLeft);
      lastRight = lastRight + alpha * (rawRight - lastRight);

      left[i] = lastLeft;
      right[i] = lastRight;
    }
    return impulse;
  }

  // Toggles ON/OFF do Master FX Global
  toggleMasterEq(enabled) {
    this.masterEqEnabled = enabled;
    const gainLow = enabled ? this.masterParams.eqLow : 0;
    const gainMid = enabled ? this.masterParams.eqMid : 0;
    const gainHigh = enabled ? this.masterParams.eqHigh : 0;

    this.masterEqLow.gain.setTargetAtTime(gainLow, this.audioCtx.getCurrentTime(), 0.01);
    this.masterEqMid.gain.setTargetAtTime(gainMid, this.audioCtx.getCurrentTime(), 0.01);
    this.masterEqHigh.gain.setTargetAtTime(gainHigh, this.audioCtx.getCurrentTime(), 0.01);
  }

  toggleMasterDelay(enabled) {
    this.masterDelayEnabled = enabled;
    const targetGain = enabled ? (this.masterParams.delayMix / 100.0) : 0;
    this.masterDelayGain.gain.setTargetAtTime(targetGain, this.audioCtx.getCurrentTime(), 0.01);
  }

  toggleMasterReverb(enabled) {
    this.masterReverbEnabled = enabled;
    const targetGain = enabled ? (this.masterParams.reverbMix / 100.0) : 0;
    this.masterReverbGain.gain.setTargetAtTime(targetGain, this.audioCtx.getCurrentTime(), 0.01);
  }

  // Master Params Setters
  setMasterEqLowGain(gainDb) {
    this.masterParams.eqLow = gainDb;
    if (this.masterEqEnabled) {
      this.masterEqLow.gain.setTargetAtTime(gainDb, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setMasterEqMidGain(gainDb) {
    this.masterParams.eqMid = gainDb;
    if (this.masterEqEnabled) {
      this.masterEqMid.gain.setTargetAtTime(gainDb, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setMasterEqHighGain(gainDb) {
    this.masterParams.eqHigh = gainDb;
    if (this.masterEqEnabled) {
      this.masterEqHigh.gain.setTargetAtTime(gainDb, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setMasterDelayTime(seconds) {
    this.masterParams.delayTime = Math.round(seconds * 1000);
    this.masterDelayNode.delayTime.setTargetAtTime(seconds, this.audioCtx.getCurrentTime(), 0.01);
  }

  setMasterDelayMix(mixNorm) {
    this.masterParams.delayMix = Math.round(mixNorm * 100);
    if (this.masterDelayEnabled) {
      this.masterDelayGain.gain.setTargetAtTime(mixNorm, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setMasterReverbMode(modeKey) {
    if (this.reverbModes[modeKey]) {
      this.masterParams.reverbMode = modeKey;
      const ctx = this.audioCtx.init();
      this.masterReverbNode.buffer = this.createSyntheticImpulse(ctx, this.reverbModes[modeKey]);
    }
  }

  setMasterReverbSize(sizeNorm) {
    this.masterParams.reverbSize = Math.round(sizeNorm * 100);
    const modeConfig = { ...this.reverbModes[this.masterParams.reverbMode || 'concert_hall'] };
    modeConfig.duration = (modeConfig.duration * 0.5) + (sizeNorm * 3.5);
    const ctx = this.audioCtx.init();
    this.masterReverbNode.buffer = this.createSyntheticImpulse(ctx, modeConfig);
  }

  setMasterReverbMix(mixNorm) {
    this.masterParams.reverbMix = Math.round(mixNorm * 100);
    if (this.masterReverbEnabled) {
      this.masterReverbGain.gain.setTargetAtTime(mixNorm, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setSelectedChannel(ch) {
    this.selectedChannel = parseInt(ch, 10) || 1;
    this.notifySelectionChange();
  }

  onSelectionChange(callback) {
    this.onSelectionChangeCallbacks.push(callback);
  }

  notifySelectionChange() {
    const chData = this.channelFx.get(this.selectedChannel);
    if (chData) {
      this.onSelectionChangeCallbacks.forEach(cb => cb(this.selectedChannel, chData.params));
    }
  }

  // Controle do Filtro Passa-Baixas (Cutoff Frequency) da pista individual
  toggleTrackCutoff(enabled, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.cutoffEnabled = enabled;
      const targetFreq = enabled ? fx.params.cutoffFreq : 20000;
      fx.cutoffFilter.frequency.setTargetAtTime(targetFreq, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setCutoffFrequency(freqHz, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.cutoffFreq = freqHz;
      if (fx.params.cutoffEnabled) {
        fx.cutoffFilter.frequency.setTargetAtTime(freqHz, this.audioCtx.getCurrentTime(), 0.01);
      }
    }
  }

  // Toggles ON/OFF dos Efeitos por Pista Individual
  toggleTrackEq(enabled, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.eqEnabled = enabled;
      const gainLow = enabled ? fx.params.eqLow : 0;
      const gainMid = enabled ? fx.params.eqMid : 0;
      const gainHigh = enabled ? fx.params.eqHigh : 0;

      fx.eqLow.gain.setTargetAtTime(gainLow, this.audioCtx.getCurrentTime(), 0.01);
      fx.eqMid.gain.setTargetAtTime(gainMid, this.audioCtx.getCurrentTime(), 0.01);
      fx.eqHigh.gain.setTargetAtTime(gainHigh, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  toggleTrackDelay(enabled, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.delayEnabled = enabled;
      const targetGain = enabled ? (fx.params.delayMix / 100.0) : 0;
      fx.delayGain.gain.setTargetAtTime(targetGain, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  toggleTrackReverb(enabled, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.reverbEnabled = enabled;
      const targetGain = enabled ? (fx.params.reverbMix / 100.0) : 0;
      fx.reverbGain.gain.setTargetAtTime(targetGain, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  // Métodos de alteração de parâmetros da pista selecionada
  setEqLowGain(gainDb, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.eqLow = gainDb;
      if (fx.params.eqEnabled) {
        fx.eqLow.gain.setTargetAtTime(gainDb, this.audioCtx.getCurrentTime(), 0.01);
      }
    }
  }

  setEqMidGain(gainDb, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.eqMid = gainDb;
      if (fx.params.eqEnabled) {
        fx.eqMid.gain.setTargetAtTime(gainDb, this.audioCtx.getCurrentTime(), 0.01);
      }
    }
  }

  setEqHighGain(gainDb, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.eqHigh = gainDb;
      if (fx.params.eqEnabled) {
        fx.eqHigh.gain.setTargetAtTime(gainDb, this.audioCtx.getCurrentTime(), 0.01);
      }
    }
  }

  setDelayTime(seconds, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.delayTime = Math.round(seconds * 1000);
      fx.delayNode.delayTime.setTargetAtTime(seconds, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setDelayMix(mixNorm, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.delayMix = Math.round(mixNorm * 100);
      if (fx.params.delayEnabled) {
        fx.delayGain.gain.setTargetAtTime(mixNorm, this.audioCtx.getCurrentTime(), 0.01);
      }
    }
  }

  setTrackReverbMode(modeKey, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx && this.reverbModes[modeKey]) {
      fx.params.reverbMode = modeKey;
      const ctx = this.audioCtx.init();
      fx.reverbNode.buffer = this.createSyntheticImpulse(ctx, this.reverbModes[modeKey]);
    }
  }

  setReverbSize(sizeNorm, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.reverbSize = Math.round(sizeNorm * 100);
      const modeConfig = { ...this.reverbModes[fx.params.reverbMode || 'concert_hall'] };
      modeConfig.duration = (modeConfig.duration * 0.5) + (sizeNorm * 3.5);
      const ctx = this.audioCtx.init();
      fx.reverbNode.buffer = this.createSyntheticImpulse(ctx, modeConfig);
    }
  }

  setReverbMix(mixNorm, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.reverbMix = Math.round(mixNorm * 100);
      if (fx.params.reverbEnabled) {
        fx.reverbGain.gain.setTargetAtTime(mixNorm, this.audioCtx.getCurrentTime(), 0.01);
      }
    }
  }

  connectChannelNode(channel, sourceGainNode, targetPannerNode) {
    const fx = this.channelFx.get(channel);
    if (!fx) {
      sourceGainNode.connect(targetPannerNode);
      return;
    }

    sourceGainNode.disconnect();
    sourceGainNode.connect(fx.cutoffFilter);

    fx.eqHigh.connect(targetPannerNode);
    fx.delayGain.connect(targetPannerNode);
    fx.reverbGain.connect(targetPannerNode);
  }
}

window.FxRackManager = FxRackManager;
