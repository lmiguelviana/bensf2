/**
 * MULTITIMBRIC MIXER CONSOLE MANAGER
 * Gerenciador dinâmico de pistas de canais MIDI (1 a 16), faders, pan, mute, solo e VU meters.
 */

class MixerConsoleManager {
  constructor(synthEngine, vuMeterManager) {
    this.synth = synthEngine;
    this.vuMeter = vuMeterManager;
    this.container = null;
    this.totalChannels = 4; // Canais iniciais visíveis (expansível até 16)
  }

  init(containerElement) {
    this.container = containerElement;
    this.renderMixer();
  }

  renderMixer() {
    if (!this.container) return;
    this.container.innerHTML = '';

    for (let ch = 1; ch <= this.totalChannels; ch++) {
      const stripEl = this.createChannelStripElement(ch);
      this.container.appendChild(stripEl);

      // Conectar AnalyserNode para o VU Meter deste canal
      const chConfig = this.synth.channels[ch];
      if (chConfig && chConfig.gainNode) {
        const canvas = stripEl.querySelector(`.vu-canvas-${ch}`);
        this.vuMeter.createAnalyserForNode(chConfig.gainNode, `ch_${ch}`, canvas);
      }
    }
  }

  createChannelStripElement(ch) {
    const strip = document.createElement('div');
    strip.className = 'mixer-channel-strip';
    strip.dataset.channel = ch;

    const chConfig = this.synth.channels[ch] || { volume: 0.8, pan: 0, muted: false, solo: false, transpose: 0 };

    strip.innerHTML = `
      <div class="channel-header">CH ${ch < 10 ? '0' + ch : ch}: LAYER ${ch}</div>

      <!-- Area do Fader + VU Meter -->
      <div class="channel-fader-area">
        <input type="range" class="vertical-fader ch-volume" data-channel="${ch}" min="0" max="1" step="0.01" value="${chConfig.volume}">
        <canvas class="vu-meter-canvas vu-canvas-${ch}" width="10" height="135"></canvas>
      </div>

      <!-- Controle de Volume Valor -->
      <div style="font-size: 10px; font-weight: 700; color: var(--accent-cyan); font-family: var(--font-mono);" id="volVal_${ch}">
        ${Math.round(chConfig.volume * 100)}%
      </div>

      <!-- Panorama (PAN) -->
      <div class="knob-group">
        <div class="knob-label">PAN (L/R)</div>
        <input type="range" class="knob-slider ch-pan" data-channel="${ch}" min="-1" max="1" step="0.05" value="${chConfig.pan}">
      </div>

      <!-- Transposição de Oitava -->
      <div class="knob-group">
        <div class="knob-label">OITAVA</div>
        <select class="ch-transpose preset-select" data-channel="${ch}" style="font-size: 11px; padding: 2px 4px;">
          <option value="-2" ${chConfig.transpose === -2 ? 'selected' : ''}>-2</option>
          <option value="-1" ${chConfig.transpose === -1 ? 'selected' : ''}>-1</option>
          <option value="0" ${chConfig.transpose === 0 ? 'selected' : ''}>0 (Std)</option>
          <option value="1" ${chConfig.transpose === 1 ? 'selected' : ''}>+1</option>
          <option value="2" ${chConfig.transpose === 2 ? 'selected' : ''}>+2</option>
        </select>
      </div>

      <!-- Botões Mute e Solo -->
      <div class="button-group-row">
        <button class="btn btn-mute ${chConfig.muted ? 'active' : ''}" data-channel="${ch}">M</button>
        <button class="btn btn-solo ${chConfig.solo ? 'active' : ''}" data-channel="${ch}">S</button>
      </div>
    `;

    // Eventos dos Controles da Pista
    const volInput = strip.querySelector('.ch-volume');
    const volDisplay = strip.querySelector(`#volVal_${ch}`);
    volInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.synth.setChannelVolume(ch, val);
      volDisplay.textContent = `${Math.round(val * 100)}%`;
    });

    const panInput = strip.querySelector('.ch-pan');
    panInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.synth.setChannelPan(ch, val);
    });

    const transposeSelect = strip.querySelector('.ch-transpose');
    transposeSelect.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      if (this.synth.channels[ch]) {
        this.synth.channels[ch].transpose = val;
      }
    });

    const muteBtn = strip.querySelector('.btn-mute');
    muteBtn.addEventListener('click', () => {
      const isMuted = !muteBtn.classList.contains('active');
      muteBtn.classList.toggle('active', isMuted);
      this.synth.setChannelMute(ch, isMuted);
    });

    const soloBtn = strip.querySelector('.btn-solo');
    soloBtn.addEventListener('click', () => {
      const isSolo = !soloBtn.classList.contains('active');
      soloBtn.classList.toggle('active', isSolo);
      this.handleSoloToggle(ch, isSolo);
    });

    return strip;
  }

  handleSoloToggle(channel, isSolo) {
    if (this.synth.channels[channel]) {
      this.synth.channels[channel].solo = isSolo;
    }

    // Verificar se existe algum canal em modo Solo
    let hasSoloActive = false;
    for (let c = 1; c <= 16; c++) {
      if (this.synth.channels[c] && this.synth.channels[c].solo) {
        hasSoloActive = true;
        break;
      }
    }

    // Se houver algum Solo ativo, mutar os outros canais
    for (let c = 1; c <= this.totalChannels; c++) {
      if (hasSoloActive) {
        const chSolo = this.synth.channels[c] && this.synth.channels[c].solo;
        this.synth.setChannelMute(c, !chSolo);
      } else {
        const chMuted = this.synth.channels[c] && this.synth.channels[c].muted;
        this.synth.setChannelMute(c, chMuted);
      }
    }
  }

  addChannel() {
    if (this.totalChannels < 16) {
      this.totalChannels++;
      this.renderMixer();
      console.log(`[MixerConsoleManager] Nova pista adicionada: Canal ${this.totalChannels}`);
    }
  }
}

window.MixerConsoleManager = MixerConsoleManager;
