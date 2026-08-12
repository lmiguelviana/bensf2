/**
 * MULTITIMBRIC MIXER CONSOLE MANAGER (16 MIDI CHANNELS WITH MIDI LEARN)
 * Gerenciador dinâmico de 16 pistas de canais MIDI, roteamento por canal físico, seleção de timbres limpos, faders, pan, mute e solo com suporte a MIDI Learn.
 */

class MixerConsoleManager {
  constructor(synthEngine, vuMeterManager) {
    this.synth = synthEngine;
    this.vuMeter = vuMeterManager;
    this.container = null;
    this.totalChannels = 4;
    this.midiLearn = null;
  }

  init(containerElement) {
    this.container = containerElement;
    this.renderMixer();
  }

  setMidiLearnManager(midiLearnManager) {
    this.midiLearn = midiLearnManager;
  }

  setVisibleChannelCount(count) {
    this.totalChannels = Math.max(1, Math.min(16, parseInt(count, 10) || 4));
    this.renderMixer();
  }

  renderMixer() {
    if (!this.container) return;
    this.container.innerHTML = '';

    for (let ch = 1; ch <= this.totalChannels; ch++) {
      const stripEl = this.createChannelStripElement(ch);
      this.container.appendChild(stripEl);

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

    const chConfig = this.synth.channels[ch] || { 
      volume: 0.8, 
      pan: 0, 
      muted: false, 
      solo: false, 
      transpose: 0, 
      assignedPresetIndex: (ch - 1),
      assignedMidiChannel: ch 
    };

    let presetOptionsHtml = `<option value="0">Default Sound</option>`;
    if (this.synth.parsedSf2Data && this.synth.parsedSf2Data.presets && this.synth.parsedSf2Data.presets.length > 0) {
      presetOptionsHtml = this.synth.parsedSf2Data.presets.map((p, idx) => {
        const isSelected = idx === chConfig.assignedPresetIndex ? 'selected' : '';
        const cleanName = (p.name || `Preset #${idx}`).replace(/[^\x20-\x7E]/g, '').trim() || `Preset ${p.bank}:${p.preset}`;
        return `<option value="${idx}" ${isSelected}>${cleanName} (${p.bank}:${p.preset})</option>`;
      }).join('');
    }

    let midiChanOptionsHtml = `<option value="all" ${chConfig.assignedMidiChannel === 'all' ? 'selected' : ''}>TODOS (Layer)</option>`;
    for (let m = 1; m <= 16; m++) {
      const isSelected = (chConfig.assignedMidiChannel === m || (chConfig.assignedMidiChannel === undefined && ch === m)) ? 'selected' : '';
      midiChanOptionsHtml += `<option value="${m}" ${isSelected}>MIDI CH ${m < 10 ? '0' + m : m}</option>`;
    }

    strip.innerHTML = `
      <div class="channel-header">CH ${ch < 10 ? '0' + ch : ch}: LAYER ${ch}</div>

      <div class="knob-group" style="width: 100%;">
        <div class="knob-label">CANAL MIDI ENTRADA</div>
        <select class="ch-midi-select preset-select" data-channel="${ch}" style="width: 100%; font-size: 10px; padding: 2px;">
          ${midiChanOptionsHtml}
        </select>
      </div>

      <div class="knob-group" style="width: 100%; margin-top: 4px;">
        <div class="knob-label">TIMBRE / SOM</div>
        <select class="ch-preset-select preset-select" data-channel="${ch}" style="width: 100%; font-size: 10px; padding: 3px; text-overflow: ellipsis;">
          ${presetOptionsHtml}
        </select>
      </div>

      <div class="channel-fader-area" style="margin-top: 6px;">
        <input type="range" class="vertical-fader ch-volume" data-channel="${ch}" min="0" max="1" step="0.01" value="${chConfig.volume}" title="Clique com o botão direito para MIDI Learn">
        <canvas class="vu-meter-canvas vu-canvas-${ch}" width="10" height="120"></canvas>
      </div>

      <div style="font-size: 10px; font-weight: 700; color: var(--accent-cyan); font-family: var(--font-mono);" id="volVal_${ch}">
        ${Math.round(chConfig.volume * 100)}%
      </div>

      <div class="knob-group">
        <div class="knob-label">PAN (L/R)</div>
        <input type="range" class="knob-slider ch-pan" data-channel="${ch}" min="-1" max="1" step="0.05" value="${chConfig.pan}" title="Clique com o botão direito para MIDI Learn">
      </div>

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

      <div class="button-group-row">
        <button class="btn btn-mute ${chConfig.muted ? 'active' : ''}" data-channel="${ch}">M</button>
        <button class="btn btn-solo ${chConfig.solo ? 'active' : ''}" data-channel="${ch}">S</button>
      </div>
    `;

    const midiSelect = strip.querySelector('.ch-midi-select');
    midiSelect.addEventListener('change', (e) => {
      const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
      if (this.synth.channels[ch]) {
        this.synth.channels[ch].assignedMidiChannel = val;
      }
    });

    const presetSelect = strip.querySelector('.ch-preset-select');
    presetSelect.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      this.synth.setChannelPreset(ch, idx);
    });

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

    // Anexar MIDI Learn por botão direito!
    if (this.midiLearn) {
      this.midiLearn.attach(volInput, `Volume Pista CH ${ch}`, (normVal) => {
        this.synth.setChannelVolume(ch, normVal);
        volInput.value = normVal;
        volDisplay.textContent = `${Math.round(normVal * 100)}%`;
      });

      this.midiLearn.attach(panInput, `PAN Pista CH ${ch}`, (normVal) => {
        const panVal = (normVal * 2.0) - 1.0;
        this.synth.setChannelPan(ch, panVal);
        panInput.value = panVal;
      });
    }

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

    let hasSoloActive = false;
    for (let c = 1; c <= 16; c++) {
      if (this.synth.channels[c] && this.synth.channels[c].solo) {
        hasSoloActive = true;
        break;
      }
    }

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
    }
  }
}

window.MixerConsoleManager = MixerConsoleManager;
