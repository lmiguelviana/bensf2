/**
 * MASTER & PER-TRACK FX RACK ENGINE
 * Módulo de processamento de efeitos com Master FX Global e FX por pista individual com interruptores ON/OFF.
 */

class FxRackManager {
  constructor(audioEngineContext) {
    this.audioCtx = audioEngineContext;

    // Master FX Nodes (Saída Geral)
    this.masterEqLow = null;
    this.masterEqMid = null;
    this.masterEqHigh = null;
    this.masterDelayNode = null;
    this.masterDelayGain = null;
    this.masterReverbNode = null;
    this.masterReverbGain = null;

    this.masterEqEnabled = true;
    this.masterDelayEnabled = true;
    this.masterReverbEnabled = true;

    this.masterParams = {
      eqLow: 0, eqMid: 0, eqHigh: 0,
      delayTime: 300, delayMix: 20,
      reverbSize: 40, reverbMix: 25
    };

    // Per-Channel FX Nodes & State (Ch 1 a 16)
    this.channelFx = new Map();
    this.selectedChannel = 1;
    this.onSelectionChangeCallbacks = [];
  }

  init() {
    const ctx = this.audioCtx.init();

    // 1. Inicializar Master FX Nodes
    this.masterEqLow = ctx.createBiquadFilter();
    this.masterEqLow.type = 'lowshelf';
    this.masterEqLow.frequency.value = 100;

    this.masterEqMid = ctx.createBiquadFilter();
    this.masterEqMid.type = 'peaking';
    this.masterEqMid.frequency.value = 1000;
    this.masterEqMid.Q.value = 1.0;

    this.masterEqHigh = ctx.createBiquadFilter();
    this.masterEqHigh.type = 'highshelf';
    this.masterEqHigh.frequency.value = 8000;

    this.masterEqLow.connect(this.masterEqMid);
    this.masterEqMid.connect(this.masterEqHigh);

    this.masterDelayNode = ctx.createDelay();
    this.masterDelayNode.delayTime.value = 0.3;
    const masterDelayFeedback = ctx.createGain();
    masterDelayFeedback.gain.value = 0.3;
    this.masterDelayGain = ctx.createGain();
    this.masterDelayGain.gain.value = 0.2;

    this.masterDelayNode.connect(masterDelayFeedback);
    masterDelayFeedback.connect(this.masterDelayNode);
    this.masterDelayNode.connect(this.masterDelayGain);

    this.masterReverbNode = ctx.createConvolver();
    this.masterReverbNode.buffer = this.createSyntheticImpulse(ctx, 2.0, 2.0);
    this.masterReverbGain = ctx.createGain();
    this.masterReverbGain.gain.value = 0.25;
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

    // 2. Inicializar Nódulos de Efeito para cada um dos 16 canais
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

      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);

      const delayNode = ctx.createDelay();
      delayNode.delayTime.value = 0.3;

      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.3;

      const delayGain = ctx.createGain();
      delayGain.gain.value = 0.2;

      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayNode.connect(delayGain);

      const reverbNode = ctx.createConvolver();
      reverbNode.buffer = this.createSyntheticImpulse(ctx, 2.0, 2.0);

      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.25;

      reverbNode.connect(reverbGain);

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
          eqEnabled: true,
          delayEnabled: true,
          reverbEnabled: true,
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

    console.log('[FxRack] Motor de Efeitos Master e por Pista inicializados.');
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

  // Master Params Setter
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

  setMasterReverbSize(sizeNorm) {
    this.masterParams.reverbSize = Math.round(sizeNorm * 100);
    const duration = 0.5 + (sizeNorm * 4.0);
    const ctx = this.audioCtx.init();
    this.masterReverbNode.buffer = this.createSyntheticImpulse(ctx, duration, 2.0);
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

  // Métodos de alteração de parâmetros do canal selecionado (Efeitos por Pista)
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
    sourceGainNode.connect(fx.eqLow);

    fx.eqHigh.connect(targetPannerNode);
    fx.delayGain.connect(targetPannerNode);
    fx.reverbGain.connect(targetPannerNode);
  }
}

window.FxRackManager = FxRackManager;
