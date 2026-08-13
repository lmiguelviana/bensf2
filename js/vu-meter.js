/**
 * REAL-TIME VU METER RENDERER
 * Renderizador de nível RMS por pista usando Web Audio AnalyserNode e Canvas HTML5.
 */

class VuMeterManager {
  constructor(audioEngineContext) {
    this.audioCtx = audioEngineContext;
    this.analysers = new Map(); // ChannelOrId -> AnalyserNode
    this.canvases = new Map();   // ChannelOrId -> HTMLCanvasElement
    this.sources = new Map();
    this.buffers = new Map();
    this.isRunning = false;
    this.animationId = null;
  }

  createAnalyserForNode(node, id, canvasElement) {
    this.removeAnalyser(id);
    const ctx = this.audioCtx.init();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    node.connect(analyser);

    this.analysers.set(id, analyser);
    this.sources.set(id, node);
    this.buffers.set(id, new Uint8Array(analyser.frequencyBinCount));
    if (canvasElement) {
      this.canvases.set(id, canvasElement);
    }

    if (!this.isRunning) {
      this.startLoop();
    }
  }

  startLoop() {
    if (this.isRunning) return;
    this.isRunning = true;

    const render = () => {
      if (!this.isRunning) return;

      this.analysers.forEach((analyser, id) => {
        const canvas = this.canvases.get(id);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const bufferLength = analyser.frequencyBinCount;
        let dataArray = this.buffers.get(id);
        if (!dataArray || dataArray.length !== bufferLength) {
          dataArray = new Uint8Array(bufferLength);
          this.buffers.set(id, dataArray);
        }
        analyser.getByteTimeDomainData(dataArray);

        // Calcular RMS / Peak Volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = (dataArray[i] - 128) / 128.0;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const peak = Math.min(1.0, rms * 3.5); // Escalar sensibilidade do gráfico

        this.drawMeter(ctx, canvas.width, canvas.height, peak);
      });

      this.animationId = requestAnimationFrame(render);
    };

    this.animationId = requestAnimationFrame(render);
  }

  drawMeter(ctx, width, height, peakLevel) {
    ctx.clearRect(0, 0, width, height);

    // Fundo escuro do VU Meter
    ctx.fillStyle = '#090c12';
    ctx.fillRect(0, 0, width, height);

    const fillHeight = height * peakLevel;
    const yStart = height - fillHeight;

    // Gradiente LED: Verde (base) -> Amarelo (médio) -> Vermelho (pico)
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#00e676');   // Verde
    gradient.addColorStop(0.7, '#ffab00'); // Amarelo
    gradient.addColorStop(0.95, '#ff1744'); // Vermelho

    ctx.fillStyle = gradient;
    ctx.fillRect(0, yStart, width, fillHeight);

    // Efeito de iluminação LED / Glow
    if (peakLevel > 0.9) {
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 8;
      ctx.fillRect(0, 0, width, 4); // Clipe vermelho no topo
      ctx.shadowBlur = 0;
    }
  }

  stop() {
    this.isRunning = false;
    if (this.animationId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  removeAnalyser(id) {
    const source = this.sources.get(id);
    const analyser = this.analysers.get(id);
    if (source && analyser && typeof source.disconnect === 'function') {
      try { source.disconnect(analyser); } catch (error) {}
    }
    if (analyser && typeof analyser.disconnect === 'function') {
      try { analyser.disconnect(); } catch (error) {}
    }
    this.sources.delete(id);
    this.analysers.delete(id);
    this.canvases.delete(id);
    this.buffers.delete(id);
  }

  destroy() {
    this.stop();
    Array.from(this.analysers.keys()).forEach((id) => this.removeAnalyser(id));
  }
}

window.VuMeterManager = VuMeterManager;
