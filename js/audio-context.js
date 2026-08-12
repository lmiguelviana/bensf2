/**
 * AUDIO CONTEXT MANAGER
 * Gerencia o contexto de áudio da Web Audio API, volume master e limiter contra distorção.
 */

class AudioEngineContext {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterLimiter = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized && this.ctx) return this.ctx;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // Node de Limiter Master — configuração transparente estilo mastering (sem pumping)
    // threshold: -3dB (headroom seguro), knee: 6dB (curva suave), ratio: 4:1 (limiter leve)
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-3.0, this.ctx.currentTime);
    this.masterLimiter.knee.setValueAtTime(6.0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(4.0, this.ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.005, this.ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.2, this.ctx.currentTime);

    // Alias para compatibilidade com FxRack (usa this.audioCtx.limiterNode)
    this.limiterNode = this.masterLimiter;

    // Node de Gain Master — 0.65 dá headroom suficiente para polifonia sem distorção
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.65, this.ctx.currentTime);

    // Conexão do fluxo de áudio: MasterGain -> MasterLimiter -> AudioDestination
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.ctx.destination);

    this.isInitialized = true;
    console.log('[AudioEngineContext] Web Audio API Inicializada com sucesso. SampleRate:', this.ctx.sampleRate);
    return this.ctx;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      return this.ctx.resume().then(() => {
        console.log('[AudioEngineContext] Contexto de áudio retomado (state: running)');
      });
    }
    return Promise.resolve();
  }

  setMasterVolume(value) {
    if (!this.masterGain || !this.ctx) return;
    const clamped = Math.max(0, Math.min(1, value));
    this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
  }

  getMasterVolume() {
    return this.masterGain ? this.masterGain.gain.value : 0.8;
  }

  getCurrentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}

// Instância global do contexto de áudio
const audioEngine = new AudioEngineContext();
window.audioEngine = audioEngine;
