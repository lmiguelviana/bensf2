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

    // Node de Limiter Master (Compressor de pico de áudio)
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime); // Previne clipping acima de -1dB
    this.masterLimiter.knee.setValueAtTime(3.0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(20.0, this.ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.1, this.ctx.currentTime);

    // Node de Gain Master (Volume Geral)
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);

    // Conexão do fluxo de áudio: MasterGain -> MasterLimiter -> AudioDestination (Alto-falantes)
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
