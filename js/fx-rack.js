/**
 * MASTER & PER-TRACK FX RACK ENGINE
 * Módulo de processamento de efeitos por pista (EQ 3-Band, Stereo Delay, Reverb Estéreo) com seleção dinâmica de canal.
 */

class FxRackManager {
  constructor(audioEngineContext) {
    this.audioCtx = audioEngineContext;

    // Master FX Nodes
    this.masterEqLow = null;
    this.masterEqMid = null;
    this.masterEqHigh = null;
    this.masterDelayNode = null;
    this.masterDelayGain = null;
    this.masterReverbNode = null;
    this.masterReverbGain = null;

    // Per-Channel FX Nodes & State (Ch 1 a 16)
    this.channelFx = new Map();
    this.selectedChannel = 1;
    this.onSelectionChangeCallbacks = [];
  }

  init() {
    const ctx = this.audioCtx.init();

    // Inicializar Nódulos de Efeito para cada um dos 16 canais
    for (let ch = 1; ch <= 16; ch++) {
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

      // Encadeamento do EQ
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);

      // Delay Node do Canal
      const delayNode = ctx.createDelay();
      delayNode.delayTime.value = 0.3;

      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.3;

      const delayGain = ctx.createGain();
      delayGain.gain.value = 0.2;

      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayNode.connect(delayGain);

      // Reverb Node do Canal
      const reverbNode = ctx.createConvolver();
      reverbNode.buffer = this.createSyntheticImpulse(ctx, 2.0, 2.0);

      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.25;

      reverbNode.connect(reverbGain);

      // Roteamento interno
      eqHigh.connect(delayNode);
      eqHigh.connect(reverbNode);

      this.channelFx.set(ch, {
        eqLow,
        eqMid,
        eqHigh,
        delayNode,
        delayGain,
        reverbNode,
        reverbGain,
        params: {
          eqLow: 0,
          eqMid: 0,
          eqHigh: 0,
          delayTime: 300,
          delayMix: 20,
          reverbSize: 40,
          reverbMix: 25
        }
      });
    }

    console.log('[FxRack] Motor de Efeitos por Pista (16 Canais) inicializado com sucesso.');
  }

  createSyntheticImpulse(ctx, durationSec, decaySec) {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * durationSec;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const env = Math.pow(1 - n, decaySec);
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }
    return impulse;
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

  getSelectedChannelParams() {
    const chData = this.channelFx.get(this.selectedChannel);
    return chData ? chData.params : null;
  }

  // Métodos de alteração de parâmetros do canal selecionado
  setEqLowGain(gainDb, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.eqLow = gainDb;
      fx.eqLow.gain.setTargetAtTime(gainDb, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setEqMidGain(gainDb, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.eqMid = gainDb;
      fx.eqMid.gain.setTargetAtTime(gainDb, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setEqHighGain(gainDb, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.eqHigh = gainDb;
      fx.eqHigh.gain.setTargetAtTime(gainDb, this.audioCtx.getCurrentTime(), 0.01);
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
      fx.delayGain.gain.setTargetAtTime(mixNorm, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  setReverbSize(sizeNorm, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.reverbSize = Math.round(sizeNorm * 100);
      const duration = 0.5 + (sizeNorm * 4.0);
      const ctx = this.audioCtx.init();
      fx.reverbNode.buffer = this.createSyntheticImpulse(ctx, duration, 2.0);
    }
  }

  setReverbMix(mixNorm, channel = this.selectedChannel) {
    const fx = this.channelFx.get(channel);
    if (fx) {
      fx.params.reverbMix = Math.round(mixNorm * 100);
      fx.reverbGain.gain.setTargetAtTime(mixNorm, this.audioCtx.getCurrentTime(), 0.01);
    }
  }

  // Roteamento dos nós de áudio do canal através do seu FX individual
  connectChannelNode(channel, sourceGainNode, targetPannerNode) {
    const fx = this.channelFx.get(channel);
    if (!fx) {
      sourceGainNode.connect(targetPannerNode);
      return;
    }

    sourceGainNode.disconnect();
    sourceGainNode.connect(fx.eqLow);

    // Conectar saída do EQ e dos efeitos paralelos ao Panner
    fx.eqHigh.connect(targetPannerNode);
    fx.delayGain.connect(targetPannerNode);
    fx.reverbGain.connect(targetPannerNode);
  }
}

window.FxRackManager = FxRackManager;
