/**
 * MASTER FX RACK PROCESSOR
 * Módulo de Efeitos de Áudio: Reverb Convolver, Stereo Delay e Equalizador de 3 Bandas.
 */

class FxRackManager {
  constructor(audioEngineContext) {
    this.audioCtx = audioEngineContext;
    this.ctx = null;

    this.inputNode = null;
    this.outputNode = null;

    // Nós de Equalizador (3-Band EQ)
    this.eqLow = null;
    this.eqMid = null;
    this.eqHigh = null;

    // Nós de Reverb
    this.reverbConvolver = null;
    this.reverbWetGain = null;
    this.reverbDryGain = null;
    this.reverbMix = 0.25;
    this.reverbSize = 0.4;

    // Nós de Delay
    this.delayNode = null;
    this.delayFeedbackGain = null;
    this.delayWetGain = null;
    this.delayDryGain = null;
    this.delayMix = 0.2;
    this.delayTime = 0.3; // 300ms

    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    this.ctx = this.audioCtx.init();

    // Node de Entrada do FX Rack
    this.inputNode = this.ctx.createGain();

    // 1. Configurar Equalizador 3-Bandas
    this.eqLow = this.ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 100;
    this.eqLow.gain.value = 0;

    this.eqMid = this.ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 1.0;
    this.eqMid.gain.value = 0;

    this.eqHigh = this.ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 8000;
    this.eqHigh.gain.value = 0;

    // Cadeia de EQ: Input -> EQLow -> EQMid -> EQHigh
    this.inputNode.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);

    // 2. Configurar Delay Stereo
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.value = this.delayTime;

    this.delayFeedbackGain = this.ctx.createGain();
    this.delayFeedbackGain.gain.value = 0.35; // 35% feedback

    this.delayWetGain = this.ctx.createGain();
    this.delayWetGain.gain.value = this.delayMix;

    this.delayDryGain = this.ctx.createGain();
    this.delayDryGain.gain.value = 1.0 - this.delayMix;

    // Feedback Loop do Delay: DelayNode -> DelayFeedback -> DelayNode
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);

    // 3. Configurar Reverb Estéreo Sintético (Impulse Response)
    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.buffer = this.generateImpulseResponse(this.reverbSize);

    this.reverbWetGain = this.ctx.createGain();
    this.reverbWetGain.gain.value = this.reverbMix;

    this.reverbDryGain = this.ctx.createGain();
    this.reverbDryGain.gain.value = 1.0 - this.reverbMix;

    // Conexões de Roteamento da Cadeia FX:
    // EQHigh -> DelayDry + DelayNode
    this.eqHigh.connect(this.delayDryGain);
    this.eqHigh.connect(this.delayNode);
    this.delayNode.connect(this.delayWetGain);

    // Delay Output Mix -> ReverbDry + ReverbConvolver
    const delayOutSum = this.ctx.createGain();
    this.delayDryGain.connect(delayOutSum);
    this.delayWetGain.connect(delayOutSum);

    delayOutSum.connect(this.reverbDryGain);
    delayOutSum.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWetGain);

    // Saída Master FX -> MasterGain -> MasterLimiter
    const masterFxOutSum = this.ctx.createGain();
    this.reverbDryGain.connect(masterFxOutSum);
    this.reverbWetGain.connect(masterFxOutSum);

    masterFxOutSum.connect(this.audioCtx.masterGain);

    this.isInitialized = true;
    console.log('[FxRackManager] Rack de Efeitos FX Inicializado (EQ 3-Bandas, Delay, Reverb)');
  }

  generateImpulseResponse(roomSize) {
    const ctx = this.ctx || this.audioCtx.init();
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * (0.5 + roomSize * 3.5))); // 0.5s a 4s
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const decay = 2.0 + (1.0 - roomSize) * 6.0;

    for (let i = 0; i < length; i++) {
      const n = length - i;
      const env = Math.pow(n / length, decay);
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }

    return impulse;
  }

  setReverbMix(mix) {
    this.reverbMix = Math.max(0, Math.min(1, mix));
    if (this.reverbWetGain && this.ctx) {
      this.reverbWetGain.gain.setTargetAtTime(this.reverbMix, this.ctx.currentTime, 0.01);
      this.reverbDryGain.gain.setTargetAtTime(1.0 - (this.reverbMix * 0.5), this.ctx.currentTime, 0.01);
    }
  }

  setReverbSize(size) {
    this.reverbSize = Math.max(0.1, Math.min(1, size));
    if (this.reverbConvolver && this.ctx) {
      this.reverbConvolver.buffer = this.generateImpulseResponse(this.reverbSize);
    }
  }

  setDelayMix(mix) {
    this.delayMix = Math.max(0, Math.min(1, mix));
    if (this.delayWetGain && this.ctx) {
      this.delayWetGain.gain.setTargetAtTime(this.delayMix, this.ctx.currentTime, 0.01);
    }
  }

  setDelayTime(timeInSec) {
    this.delayTime = Math.max(0.05, Math.min(1.5, timeInSec));
    if (this.delayNode && this.ctx) {
      this.delayNode.delayTime.setTargetAtTime(this.delayTime, this.ctx.currentTime, 0.01);
    }
  }

  setEqLowGain(gainDb) {
    if (this.eqLow && this.ctx) {
      this.eqLow.gain.setTargetAtTime(gainDb, this.ctx.currentTime, 0.01);
    }
  }

  setEqMidGain(gainDb) {
    if (this.eqMid && this.ctx) {
      this.eqMid.gain.setTargetAtTime(gainDb, this.ctx.currentTime, 0.01);
    }
  }

  setEqHighGain(gainDb) {
    if (this.eqHigh && this.ctx) {
      this.eqHigh.gain.setTargetAtTime(gainDb, this.ctx.currentTime, 0.01);
    }
  }
}

window.FxRackManager = FxRackManager;
