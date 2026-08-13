/**
 * VELOCITY CURVE VISUALIZER & EDITOR (KONTAKT / ABLETON STYLE)
 * Visualizador dinâmico com gráfico interativo de 128 barras para Curvas de Sensibilidade de Velocity.
 */

class VelocityVisualizerManager {
  constructor(canvasElement, synthEngine, settingsGetter) {
    this.canvas = canvasElement;
    this.ctx = canvasElement ? canvasElement.getContext('2d') : null;
    this.synth = synthEngine;
    this.settingsGetter = settingsGetter || null;
    this.activeMarker = null; // { inVel, outVel, alpha }
    this.animationId = null;
    this.removeVelocityListener = null;

    if (this.synth) {
      const handleVelocity = (ch, inVel, outVel) => {
        this.activeMarker = { inVel, outVel, alpha: 1.0 };
        this.startLoop();
      };
      if (typeof this.synth.addVelocityListener === 'function') {
        this.removeVelocityListener = this.synth.addVelocityListener(handleVelocity);
      } else {
        this.synth.onVelocityTrigger = handleVelocity;
      }
    }

    this.render();
  }

  startLoop() {
    if (this.animationId !== null || typeof requestAnimationFrame !== 'function') return;
    const draw = () => {
      this.animationId = null;
      if (typeof document !== 'undefined' && document.hidden) {
        this.activeMarker = null;
        return;
      }
      this.render();
      if (this.activeMarker) this.animationId = requestAnimationFrame(draw);
    };
    this.animationId = requestAnimationFrame(draw);
  }

  destroy() {
    if (this.animationId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.removeVelocityListener) {
      this.removeVelocityListener();
      this.removeVelocityListener = null;
    }
  }

  getNormalizedOutputVelocity(inputVelocity, settings) {
    if (this.synth && typeof this.synth.calculateVelocityResponse === 'function') {
      return this.synth.calculateVelocityResponse(inputVelocity, 1, settings).effectiveVelocity / 127.0;
    }
    return Math.max(1, Math.min(127, inputVelocity)) / 127.0;
  }

  render(settingsOverride) {
    if (!this.canvas || !this.ctx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    // Fundo do gráfico (DAW dark glass aesthetic)
    ctx.fillStyle = 'rgba(10, 13, 20, 0.95)';
    ctx.fillRect(0, 0, width, height);

    // Linhas de grade (Grid lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 32; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 15; y < height; y += 15) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    let settings = settingsOverride;
    if (!settings && typeof this.settingsGetter === 'function') {
      settings = this.settingsGetter();
    }
    if (!settings && this.synth && this.synth.globalVelocitySettings) {
      settings = this.synth.globalVelocitySettings;
    }
    if (!settings) {
      settings = { mode: 'normal', minVel: 1, maxVel: 127, curvePower: 2.0 };
    }

    // Desenhar 127 barras verticais de entrada vs saída (Estilo Kontakt / Ableton Live)
    const barWidth = width / 127.0;

    for (let i = 1; i <= 127; i++) {
      const normGain = this.getNormalizedOutputVelocity(i, settings);

      const barHeight = Math.max(1, normGain * (height - 6));
      const x = (i - 1) * barWidth;
      const y = height - barHeight;

      // Gradiente de neon das barras verticais
      const grad = ctx.createLinearGradient(0, height, 0, y);
      grad.addColorStop(0, 'rgba(0, 242, 254, 0.2)');
      grad.addColorStop(1, 'rgba(123, 97, 255, 0.85)');

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barHeight);
    }

    // Linha de Curva Superior (White Curve Line)
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 127; i++) {
      const normGain = this.getNormalizedOutputVelocity(i, settings);

      const barHeight = normGain * (height - 6);
      const x = (i - 1) * barWidth;
      const y = height - barHeight;

      if (i === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Marcador em tempo real da nota tocada
    if (this.activeMarker) {
      const markerX = (this.activeMarker.inVel - 1) * barWidth;
      const markerY = height - ((this.activeMarker.outVel / 127.0) * (height - 6));

      ctx.strokeStyle = `rgba(0, 242, 254, ${this.activeMarker.alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(markerX, 0);
      ctx.lineTo(markerX, height);
      ctx.stroke();

      ctx.fillStyle = `rgba(255, 255, 255, ${this.activeMarker.alpha})`;
      ctx.beginPath();
      ctx.arc(markerX, markerY, 4, 0, Math.PI * 2);
      ctx.fill();

      this.activeMarker.alpha -= 0.025;
      if (this.activeMarker.alpha <= 0) {
        this.activeMarker = null;
      }
    }
  }
}

window.VelocityVisualizerManager = VelocityVisualizerManager;
