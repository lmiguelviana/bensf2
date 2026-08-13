/**
 * MULTITIMBRIC MIXER CONSOLE MANAGER (WITH KEYBOARD CAPTURE & TYPED SPLIT C0..C7)
 * Gerenciador dinâmico de 16 pistas com marcação de Zona de Teclado (Split Min/Max) via clique no controlador MIDI físico ou digitação direta (ex: C0, C7).
 */

function midiToNoteName(midiNum) {
  if (midiNum === undefined || midiNum === null || isNaN(midiNum)) return 'C-1';
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNum / 12) - 1;
  const noteName = noteNames[midiNum % 12];
  return `${noteName}${octave}`;
}

function noteNameToMidi(str) {
  if (typeof str === 'number') return Math.max(0, Math.min(127, Math.round(str)));
  if (!str) return null;
  const clean = String(str).trim().toUpperCase()
    .replace('DB', 'C#')
    .replace('EB', 'D#')
    .replace('GB', 'F#')
    .replace('AB', 'G#')
    .replace('BB', 'A#')
    .replace('DO', 'C')
    .replace('RE', 'D')
    .replace('MI', 'E')
    .replace('FA', 'F')
    .replace('SOL', 'G')
    .replace('LA', 'A')
    .replace('SI', 'B');

  const match = clean.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return null;

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteIndex = noteNames.indexOf(match[1]);
  if (noteIndex === -1) return null;

  const octave = parseInt(match[2], 10);
  const midiNum = (octave + 1) * 12 + noteIndex;
  return Math.max(0, Math.min(127, midiNum));
}

function escapeMixerHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class MixerConsoleManager {
  constructor(synthEngine, vuMeterManager) {
    this.synth = synthEngine;
    this.vuMeter = vuMeterManager;
    this.container = null;
    this.totalChannels = 4;
    this.midiLearn = null;
    this.fxRack = null;
    this.selectedChannel = 1;
    this.userMuteState = new Map();
    for (let ch = 1; ch <= 16; ch++) {
      const channel = this.synth.channels[ch];
      this.userMuteState.set(ch, !!(channel && (channel.userMuted ?? channel.muted)));
    }
  }

  init(containerElement) {
    this.container = containerElement;
    this.applyAllChannelAudibility();
    this.renderMixer();
  }

  setMidiLearnManager(midiLearnManager) {
    this.midiLearn = midiLearnManager;
  }

  setFxRackManager(fxRackManager) {
    this.fxRack = fxRackManager;
  }

  setVisibleChannelCount(count, shouldRender = true) {
    this.totalChannels = Math.max(1, Math.min(16, parseInt(count, 10) || 4));
    if (this.selectedChannel > this.totalChannels) {
      this.selectedChannel = this.totalChannels;
      if (this.fxRack) this.fxRack.setSelectedChannel(this.selectedChannel);
    }
    this.applyAllChannelAudibility();
    if (shouldRender) this.renderMixer();
  }

  selectChannel(ch) {
    this.selectedChannel = Math.max(1, Math.min(this.totalChannels, parseInt(ch, 10) || 1));
    if (this.container) {
      this.container.querySelectorAll('.mixer-channel-strip').forEach(el => {
        const c = parseInt(el.dataset.channel, 10);
        const selected = c === this.selectedChannel;
        el.classList.toggle('selected', selected);
        el.setAttribute('aria-current', selected ? 'true' : 'false');
      });
    }

    if (this.fxRack) {
      this.fxRack.setSelectedChannel(this.selectedChannel);
    }
  }

  updateChannelPresetDropdown(ch, presetIdx) {
    if (!this.container) return;
    const strip = this.container.querySelector(`.mixer-channel-strip[data-channel="${ch}"]`);
    if (strip) {
      const select = strip.querySelector('.ch-preset-select');
      if (select) {
        select.value = presetIdx;
      }
    }
  }

  renderMixer() {
    if (!this.container) return;
    this.releaseMixerAnalysers();
    this.container.innerHTML = '';

    for (let ch = 1; ch <= this.totalChannels; ch++) {
      const stripEl = this.createChannelStripElement(ch);
      if (ch === this.selectedChannel) {
        stripEl.classList.add('selected');
      }
      this.container.appendChild(stripEl);

      const chConfig = this.synth.channels[ch];
      if (chConfig && chConfig.gainNode && this.vuMeter) {
        const canvas = stripEl.querySelector(`.vu-canvas-${ch}`);
        this.vuMeter.createAnalyserForNode(chConfig.gainNode, `ch_${ch}`, canvas);
      }
    }
  }

  createChannelStripElement(ch) {
    const strip = document.createElement('div');
    strip.className = 'mixer-channel-strip';
    strip.id = `channelStrip_${ch}`;
    strip.dataset.channel = ch;
    strip.tabIndex = 0;
    strip.setAttribute('role', 'group');

    const chConfig = this.synth.channels[ch] || { 
      name: `CH ${ch < 10 ? '0' + ch : ch}: LAYER ${ch}`,
      volume: 0.8, 
      pan: 0, 
      muted: false, 
      solo: false, 
      transpose: 0, 
      semitoneTranspose: 0,
      assignedPresetIndex: null, // sem timbre por padrão até o usuário escolher
      assignedMidiChannel: 'all',
      keyRangeLow: 0,
      keyRangeHigh: 127
    };
    strip.setAttribute('aria-label', `Pista ${ch}: ${String(chConfig.name || `Layer ${ch}`)}. Pressione Enter ou EspaÃ§o para selecionar os efeitos.`);
    strip.setAttribute('aria-current', ch === this.selectedChannel ? 'true' : 'false');

    let presetOptionsHtml = `<option value="">(sem timbre)</option>`;
    if (this.synth.parsedSf2Data && this.synth.parsedSf2Data.presets && this.synth.parsedSf2Data.presets.length > 0) {
      const noTimbreSelected = chConfig.assignedPresetIndex === null || chConfig.assignedPresetIndex === undefined;
      presetOptionsHtml = `<option value="" ${noTimbreSelected ? 'selected' : ''} style="color:#888;">(sem timbre)</option>`;
      presetOptionsHtml += this.synth.parsedSf2Data.presets.map((p, idx) => {
        const isSelected = !noTimbreSelected && idx === chConfig.assignedPresetIndex ? 'selected' : '';
        const displayName = String(p.name || `Preset #${idx}`).trim() || `Preset ${p.bank}:${p.preset}`;
        const sourceTag = p.sf2Source ? ` [${p.sf2Source}]` : '';
        return `<option value="${idx}" ${isSelected}>${escapeMixerHtml(displayName + sourceTag)} (${escapeMixerHtml(p.bank)}:${escapeMixerHtml(p.preset)})</option>`;
      }).join('');
    }

    let midiChanOptionsHtml = `<option value="all" ${chConfig.assignedMidiChannel === 'all' || chConfig.assignedMidiChannel === undefined ? 'selected' : ''}>TODOS (Layer)</option>`;
    for (let m = 1; m <= 16; m++) {
      const isSelected = (chConfig.assignedMidiChannel === m) ? 'selected' : '';
      midiChanOptionsHtml += `<option value="${m}" ${isSelected}>MIDI CH ${m < 10 ? '0' + m : m}</option>`;
    }

    let semitoneOptionsHtml = '';
    for (let s = 0; s <= 12; s++) {
      const isSelected = (chConfig.semitoneTranspose === s || (s === 0 && (chConfig.semitoneTranspose === undefined || chConfig.semitoneTranspose === null))) ? 'selected' : '';
      const label = s > 0 ? `+${s}` : `${s}`;
      semitoneOptionsHtml += `<option value="${s}" ${isSelected}>${label}</option>`;
    }

    const lowVal = chConfig.keyRangeLow !== undefined ? chConfig.keyRangeLow : 0;
    const highVal = chConfig.keyRangeHigh !== undefined ? chConfig.keyRangeHigh : 127;

    strip.innerHTML = `
      <div class="channel-header" title="Clique duas vezes sobre o nome para editar">
        <div class="ch-header-top-bar" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <div class="ch-name-container" style="display: flex; align-items: center; justify-content: center; flex: 1; overflow: hidden; margin-right: 2px;">
            <span class="ch-name-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeMixerHtml(chConfig.name)}</span>
          </div>
          <button class="btn-remove-track" data-channel="${ch}" title="Remover esta pista do Mixer" style="background: transparent; border: none; color: var(--accent-danger); font-size: 12px; font-weight: 800; cursor: pointer; padding: 0 2px; line-height: 1;">✕</button>
        </div>
      </div>

      <div class="knob-group" style="width: 100%; margin-top: 4px;">
        <div class="knob-label">TIMBRE SOUNDFONT</div>
        <select class="ch-preset-select preset-select" data-channel="${ch}" title="Nenhum timbre carregado">
          ${presetOptionsHtml}
        </select>
      </div>

      <div class="knob-group" style="width: 100%; margin-top: 3px;">
        <div class="knob-label">ROTEAMENTO MIDI</div>
        <select class="ch-midi-select preset-select" data-channel="${ch}">
          ${midiChanOptionsHtml}
        </select>
      </div>

      <div style="display: flex; gap: 4px; width: 100%; margin-top: 3px;">
        <div class="knob-group" style="flex: 1;">
          <div class="knob-label">OITAVA</div>
          <select class="ch-transpose preset-select" data-channel="${ch}" style="font-size: 10px; padding: 2px;">
            <option value="-2" ${chConfig.transpose === -2 ? 'selected' : ''}>-2</option>
            <option value="-1" ${chConfig.transpose === -1 ? 'selected' : ''}>-1</option>
            <option value="0" ${chConfig.transpose === 0 ? 'selected' : ''}>0 (Std)</option>
            <option value="1" ${chConfig.transpose === 1 ? 'selected' : ''}>+1</option>
            <option value="2" ${chConfig.transpose === 2 ? 'selected' : ''}>+2</option>
          </select>
        </div>

        <div class="knob-group" style="flex: 1;">
          <div class="knob-label">SEMITOM</div>
          <select class="ch-semitone preset-select" data-channel="${ch}" style="font-size: 10px; padding: 2px;">
            ${semitoneOptionsHtml}
          </select>
        </div>
      </div>

      <div class="channel-fader-area" style="margin-top: 6px;">
        <input type="range" class="vertical-fader ch-volume" data-channel="${ch}" min="0" max="1" step="0.01" value="${escapeMixerHtml(chConfig.volume)}" title="Clique com o botão direito para MIDI Learn">
        <canvas class="vu-meter-canvas vu-canvas-${ch}" width="10" height="120"></canvas>
      </div>

      <div style="font-size: 10px; font-weight: 700; color: var(--accent-cyan); font-family: var(--font-mono);" id="volVal_${ch}">
        ${Math.round(chConfig.volume * 100)}%
      </div>

      <div class="knob-group">
        <div class="knob-label">PAN (L/R)</div>
        <input type="range" class="knob-slider ch-pan" data-channel="${ch}" min="-1" max="1" step="0.05" value="${escapeMixerHtml(chConfig.pan)}" title="Clique com o botão direito para MIDI Learn">
      </div>

      <!-- ZONA DE SPLIT DO TECLADO (DIGITAR EX: C0, C7 OU TOCAR NO CONTROLADOR MIDI) -->
      <div class="knob-group" style="width: 100%; margin-top: 2px;">
        <div class="knob-label" style="color: var(--accent-cyan);">SPLIT TECLADO</div>
        <div style="display: flex; gap: 4px; width: 100%; align-items: center; justify-content: center;">
          <input type="text" class="ch-split-low" data-channel="${ch}" value="${midiToNoteName(lowVal)}" placeholder="Início" title="Clique ou pressione uma tecla no controlador físico para gravar o Início (ex: C0, C2, C4)" style="width: 48%; text-align: center; font-family: var(--font-heading); font-weight: 800; font-size: 10px; padding: 2px 2px; background: rgba(0, 242, 254, 0.1); color: var(--accent-cyan); border: 1px solid rgba(0, 242, 254, 0.4); border-radius: 4px; outline: none; transition: all 0.2s ease;">
          <span style="font-size: 8px; color: var(--text-muted); font-weight: 800;">à</span>
          <input type="text" class="ch-split-high" data-channel="${ch}" value="${midiToNoteName(highVal)}" placeholder="Fim" title="Clique ou pressione uma tecla no controlador físico para gravar o Fim (ex: B3, C7, G9)" style="width: 48%; text-align: center; font-family: var(--font-heading); font-weight: 800; font-size: 10px; padding: 2px 2px; background: rgba(0, 242, 254, 0.1); color: var(--accent-cyan); border: 1px solid rgba(0, 242, 254, 0.4); border-radius: 4px; outline: none; transition: all 0.2s ease;">
        </div>
      </div>

      <!-- BADGE STATUS VELOCITY DA PISTA (CONFIGURÁVEL EM EFEITOS DA PISTA) -->
      <div class="knob-group" style="width: 100%; margin-top: 3px; text-align: center;">
        <div class="knob-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>VELOCITY</span>
          <span class="ch-vel-badge-${ch}" style="font-size: 8px; color: ${chConfig.velocitySettings && !chConfig.velocitySettings.useGlobal ? 'var(--accent-cyan)' : 'var(--text-muted)'}; font-weight: 800;">
            ${chConfig.velocitySettings && !chConfig.velocitySettings.useGlobal ? '● PISTA' : '🌐 GLOBAL'}
          </span>
        </div>
      </div>

      <div class="button-group-row" style="margin-top: 4px;">
        <button class="btn btn-mute ${this.getChannelUserMuted(ch) ? 'active' : ''}" data-channel="${ch}">M</button>
        <button class="btn btn-solo ${chConfig.solo ? 'active' : ''}" data-channel="${ch}">S</button>
      </div>
    `;

    // Handler do Botão Remover Pista (✕)
    const btnRemove = strip.querySelector('.btn-remove-track');
    if (btnRemove) {
      btnRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeChannel(ch);
      });
    }

    // Handler de Edição Inline por Duplo Clique
    const headerEl = strip.querySelector('.channel-header');
    let isEditingInline = false;

    headerEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (isEditingInline) return;
      isEditingInline = true;

      const currentName = this.synth.channels[ch] ? this.synth.channels[ch].name : `CH ${ch}: LAYER ${ch}`;

      headerEl.innerHTML = `
        <div class="inline-rename-container" style="display: flex; gap: 4px; width: 100%; align-items: center; justify-content: center;">
          <input type="text" class="inline-rename-input" value="${escapeMixerHtml(currentName)}" style="flex: 1; min-width: 0; background: #ffffff; color: #000000; font-family: var(--font-heading); font-weight: 700; font-size: 11px; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--accent-cyan); outline: none;">
          <button class="inline-rename-ok-btn btn btn-primary" style="padding: 2px 6px; font-size: 10px; font-weight: 800; border-radius: 4px;">OK</button>
        </div>
      `;

      const inputEl = headerEl.querySelector('.inline-rename-input');
      const okBtn = headerEl.querySelector('.inline-rename-ok-btn');

      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }

      const saveInlineName = () => {
        if (!isEditingInline) return;
        isEditingInline = false;
        const newName = inputEl.value.trim() || currentName;
        this.synth.setChannelName(ch, newName);

        headerEl.innerHTML = `
          <div class="ch-header-top-bar" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <div class="ch-name-container" style="display: flex; align-items: center; justify-content: center; flex: 1; overflow: hidden; margin-right: 2px;">
              <span class="ch-name-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeMixerHtml(newName)}</span>
            </div>
            <button class="btn-remove-track" data-channel="${ch}" title="Remover pista CH ${ch}">✕</button>
          </div>
          <span class="selected-badge" style="font-size: 8px; color: var(--accent-cyan); display: ${ch === this.selectedChannel ? 'inline-block' : 'none'};">● FX SELECIONADO</span>
        `;

        const newRemoveBtn = headerEl.querySelector('.btn-remove-track');
        if (newRemoveBtn) {
          newRemoveBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.removeChannel(ch);
          });
        }

        if (this.selectedChannel === ch && this.fxRack) {
          this.fxRack.notifySelectionChange();
        }
      };

      if (okBtn) {
        okBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          saveInlineName();
        });
      }

      if (inputEl) {
        inputEl.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            saveInlineName();
          } else if (ev.key === 'Escape') {
            ev.preventDefault();
            isEditingInline = false;
            headerEl.innerHTML = `
              <div class="ch-header-top-bar" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div class="ch-name-container" style="display: flex; align-items: center; justify-content: center; flex: 1; overflow: hidden; margin-right: 2px;">
                  <span class="ch-name-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeMixerHtml(currentName)}</span>
                </div>
                <button class="btn-remove-track" data-channel="${ch}" title="Remover pista CH ${ch}">✕</button>
              </div>
              <span class="selected-badge" style="font-size: 8px; color: var(--accent-cyan); display: ${ch === this.selectedChannel ? 'inline-block' : 'none'};">● FX SELECIONADO</span>
            `;

            const newRemoveBtn = headerEl.querySelector('.btn-remove-track');
            if (newRemoveBtn) {
              newRemoveBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this.removeChannel(ch);
              });
            }
          }
        });
      }
    });

    // Selecionar pista ao clicar no strip
    strip.addEventListener('click', (event) => {
      if (event.target.closest('button, input, select, a, [role="button"]')) return;
      this.selectChannel(ch);
    });
    strip.addEventListener('keydown', (event) => {
      if (event.target !== strip || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      this.selectChannel(ch);
    });

    const midiSelect = strip.querySelector('.ch-midi-select');
    midiSelect.addEventListener('change', (e) => {
      const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
      if (this.synth.channels[ch]) {
        this.synth.channels[ch].assignedMidiChannel = val;
      }
    });

    const presetSelect = strip.querySelector('.ch-preset-select');
    // Atualizar title do select com nome completo do timbre (para tooltip quando truncado)
    const updatePresetTitle = () => {
      const selOpt = presetSelect.options[presetSelect.selectedIndex];
      presetSelect.title = selOpt ? selOpt.text : 'Nenhum timbre carregado';
    };
    updatePresetTitle();
    presetSelect.addEventListener('change', (e) => {
      if (e.target.value === '' || e.target.value === null || e.target.value === 'none') {
        this.synth.setChannelPreset(ch, null);
        presetSelect.title = 'Nenhum timbre carregado';
        return;
      }
      const idx = parseInt(e.target.value, 10);
      this.synth.setChannelPreset(ch, idx);
      updatePresetTitle();
    });

    const velSelect = strip.querySelector('.ch-velocity-select');
    if (velSelect) {
      velSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        const badge = strip.querySelector(`.ch-vel-badge-${ch}`);
        if (!this.synth.channels[ch].velocitySettings) {
          this.synth.channels[ch].velocitySettings = { useGlobal: true, mode: 'normal', minVel: 1, maxVel: 127 };
        }

        if (val === 'global') {
          this.synth.channels[ch].velocitySettings.useGlobal = true;
          if (badge) {
            badge.textContent = '🌐 GLOBAL';
            badge.style.color = 'var(--text-muted)';
          }
        } else {
          this.synth.channels[ch].velocitySettings.useGlobal = false;
          this.synth.channels[ch].velocitySettings.mode = val;
          if (badge) {
            badge.textContent = '● PISTA';
            badge.style.color = 'var(--accent-cyan)';
          }
        }
      });
    }

    const volInput = strip.querySelector('.ch-volume');
    const volDisplay = strip.querySelector(`#volVal_${ch}`);
    volInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.synth.setChannelVolume(ch, val);
      this.applyChannelAudibility(ch);
      volDisplay.textContent = `${Math.round(val * 100)}%`;
    });

    const panInput = strip.querySelector('.ch-pan');
    panInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.synth.setChannelPan(ch, val);
    });

    // Anexar MIDI Learn por botão direito!
    if (this.midiLearn) {
      this.midiLearn.attach(volInput, `Volume Pista ${chConfig.name}`, (normVal) => {
        this.synth.setChannelVolume(ch, normVal);
        this.applyChannelAudibility(ch);
        volInput.value = normVal;
        volDisplay.textContent = `${Math.round(normVal * 100)}%`;
      });

      this.midiLearn.attach(panInput, `PAN Pista ${chConfig.name}`, (normVal) => {
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

    const semitoneSelect = strip.querySelector('.ch-semitone');
    if (semitoneSelect) {
      semitoneSelect.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.synth.channels[ch]) {
          this.synth.channels[ch].semitoneTranspose = val;
        }
      });
    }

    // Split Low Input: Digitação + Captura via Teclado Físico / Virtual
    const splitLowInput = strip.querySelector('.ch-split-low');
    if (splitLowInput) {
      const updateLowVal = (newMidi) => {
        if (newMidi !== null && newMidi >= 0 && newMidi <= 127) {
          this.synth.channels[ch].keyRangeLow = newMidi;
          splitLowInput.value = midiToNoteName(newMidi);
          if (window.showToastNotification) {
            window.showToastNotification('Split Início Definido', `Pista CH ${ch}: Início gravado em "${midiToNoteName(newMidi)}"`, 'info');
          }
        } else {
          splitLowInput.value = midiToNoteName(this.synth.channels[ch].keyRangeLow);
        }
      };

      let isLearningLow = false;
      const cancelLearnLow = () => {
        if (isLearningLow) {
          isLearningLow = false;
          splitLowInput.value = midiToNoteName(this.synth.channels[ch].keyRangeLow);
          splitLowInput.style.borderColor = '';
          splitLowInput.style.boxShadow = '';
          if (window.webMidi) window.webMidi.setNoteLearningCallback(null);
        }
      };

      const startLearnLow = () => {
        isLearningLow = true;
        splitLowInput.value = 'TOCAR...';
        splitLowInput.style.borderColor = 'var(--accent-cyan)';
        splitLowInput.style.boxShadow = '0 0 10px var(--accent-cyan)';

        if (window.webMidi) {
          window.webMidi.setNoteLearningCallback((noteNum) => {
            isLearningLow = false;
            splitLowInput.style.borderColor = '';
            splitLowInput.style.boxShadow = '';
            updateLowVal(noteNum);
            // Feedback de áudio: tocar a nota para o usuário ouvir onde está no teclado
            if (this.synth) this.synth.noteOnTrack(noteNum, 80, ch);
            setTimeout(() => { if (this.synth) this.synth.noteOffTrack(noteNum, ch); }, 500);
          });
        }
      };

      splitLowInput.addEventListener('click', (e) => {
        e.stopPropagation();
        startLearnLow();
      });

      splitLowInput.addEventListener('blur', () => {
        cancelLearnLow();
      });

      splitLowInput.addEventListener('change', (e) => {
        isLearningLow = false;
        const parsed = noteNameToMidi(e.target.value);
        updateLowVal(parsed);
      });

      splitLowInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          isLearningLow = false;
          const parsed = noteNameToMidi(e.target.value);
          updateLowVal(parsed);
          splitLowInput.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelLearnLow();
          splitLowInput.blur();
        }
      });
    }

    // Split High Input: Digitação + Captura via Teclado Físico / Virtual
    const splitHighInput = strip.querySelector('.ch-split-high');
    if (splitHighInput) {
      const updateHighVal = (newMidi) => {
        if (newMidi !== null && newMidi >= 0 && newMidi <= 127) {
          this.synth.channels[ch].keyRangeHigh = newMidi;
          splitHighInput.value = midiToNoteName(newMidi);
          if (window.showToastNotification) {
            window.showToastNotification('Split Fim Definido', `Pista CH ${ch}: Fim gravado em "${midiToNoteName(newMidi)}"`, 'info');
          }
        } else {
          splitHighInput.value = midiToNoteName(this.synth.channels[ch].keyRangeHigh);
        }
      };

      let isLearningHigh = false;
      const cancelLearnHigh = () => {
        if (isLearningHigh) {
          isLearningHigh = false;
          splitHighInput.value = midiToNoteName(this.synth.channels[ch].keyRangeHigh);
          splitHighInput.style.borderColor = '';
          splitHighInput.style.boxShadow = '';
          if (window.webMidi) window.webMidi.setNoteLearningCallback(null);
        }
      };

      const startLearnHigh = () => {
        isLearningHigh = true;
        splitHighInput.value = 'TOCAR...';
        splitHighInput.style.borderColor = 'var(--accent-purple)';
        splitHighInput.style.boxShadow = '0 0 10px var(--accent-purple)';

        if (window.webMidi) {
          window.webMidi.setNoteLearningCallback((noteNum) => {
            isLearningHigh = false;
            splitHighInput.style.borderColor = '';
            splitHighInput.style.boxShadow = '';
            updateHighVal(noteNum);
            // Feedback de áudio: tocar a nota para o usuário ouvir onde está no teclado
            if (this.synth) this.synth.noteOnTrack(noteNum, 80, ch);
            setTimeout(() => { if (this.synth) this.synth.noteOffTrack(noteNum, ch); }, 500);
          });
        }
      };

      splitHighInput.addEventListener('click', (e) => {
        e.stopPropagation();
        startLearnHigh();
      });

      splitHighInput.addEventListener('blur', () => {
        cancelLearnHigh();
      });

      splitHighInput.addEventListener('change', (e) => {
        isLearningHigh = false;
        const parsed = noteNameToMidi(e.target.value);
        updateHighVal(parsed);
      });

      splitHighInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          isLearningHigh = false;
          const parsed = noteNameToMidi(e.target.value);
          updateHighVal(parsed);
          splitHighInput.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelLearnHigh();
          splitHighInput.blur();
        }
      });
    }

    const muteBtn = strip.querySelector('.btn-mute');
    muteBtn.dataset.midiLearnKey = `ch_${ch}_mute`;
    muteBtn.title = "Mute (Silenciar) - Clique com o botão direito para MIDI Learn";
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isMuted = !this.getChannelUserMuted(ch);
      muteBtn.classList.toggle('active', isMuted);
      this.setChannelUserMute(ch, isMuted);
    });

    const soloBtn = strip.querySelector('.btn-solo');
    soloBtn.dataset.midiLearnKey = `ch_${ch}_solo`;
    soloBtn.title = "Solo (Isolar Pista) - Clique com o botão direito para MIDI Learn";
    soloBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isSolo = !soloBtn.classList.contains('active');
      soloBtn.classList.toggle('active', isSolo);
      this.handleSoloToggle(ch, isSolo);
    });

    if (this.midiLearn) {
      // Botões são alternados uma única vez pelo MidiLearnManager na borda do CC.
      this.midiLearn.attach(muteBtn, `Mute Pista ${chConfig.name}`, () => {});
      this.midiLearn.attach(soloBtn, `Solo Pista ${chConfig.name}`, () => {});
    }

    return strip;
  }

  handleSoloToggle(channel, isSolo) {
    if (this.synth.channels[channel]) {
      this.synth.channels[channel].solo = isSolo;
    }

    this.applyAllChannelAudibility();
  }

  addChannel() {
    if (this.totalChannels < 16) {
      this.setVisibleChannelCount(this.totalChannels + 1);
    }
  }

  removeChannel(ch) {
    ch = parseInt(ch, 10);
    if (!Number.isFinite(ch) || ch < 1 || ch > this.totalChannels) return;
    if (this.totalChannels <= 1) {
      if (window.showToastNotification) {
        window.showToastNotification('Operação Não Permitida', 'É necessário manter pelo menos 1 pista ativa no Mixer.', 'warning');
      }
      return;
    }

    if (typeof this.synth.stopAllVoices === 'function') {
      this.synth.stopAllVoices();
    }

    const previousTotal = this.totalChannels;
    const channelStates = new Map();
    const trackFxStates = new Map();
    for (let source = ch + 1; source <= previousTotal; source++) {
      channelStates.set(source, this.captureChannelState(source));
      if (this.fxRack && typeof this.fxRack.getTrackState === 'function') {
        trackFxStates.set(source, this.fxRack.getTrackState(source));
      }
    }

    for (let target = ch; target < previousTotal; target++) {
      this.applyChannelState(target, channelStates.get(target + 1));
      if (this.fxRack && typeof this.fxRack.applyTrackState === 'function') {
        this.fxRack.applyTrackState(target, trackFxStates.get(target + 1) || {});
      }
    }
    this.resetChannelState(previousTotal);
    if (this.fxRack && typeof this.fxRack.resetTrackState === 'function') {
      this.fxRack.resetTrackState(previousTotal);
    }

    if (this.midiLearn && typeof this.midiLearn.removeBindingsForChannel === 'function') {
      for (let affected = ch; affected <= previousTotal; affected++) {
        this.midiLearn.removeBindingsForChannel(affected);
      }
    }

    this.totalChannels = previousTotal - 1;

    const selectEl = document.getElementById('mixerChannelCountSelect');
    if (selectEl) {
      selectEl.value = this.totalChannels;
    }

    this.selectedChannel = Math.max(1, Math.min(this.selectedChannel, this.totalChannels));
    if (this.fxRack) this.fxRack.setSelectedChannel(this.selectedChannel);

    this.applyAllChannelAudibility();
    this.renderMixer();

    if (window.showToastNotification) {
      window.showToastNotification('Pista Removida', `A pista foi removida do Mixer. Total de pistas: ${this.totalChannels}`, 'info');
    }
  }

  updateChannelVelocityBadge(ch) {
    const badge = document.querySelector(`.ch-vel-badge-${ch}`);
    if (!badge) return;
    const chConfig = this.synth.channels[ch];
    const isCustom = chConfig && chConfig.velocitySettings && !chConfig.velocitySettings.useGlobal;
    badge.textContent = isCustom ? '● PISTA' : '🌐 GLOBAL';
    badge.style.color = isCustom ? 'var(--accent-cyan)' : 'var(--text-muted)';
  }

  getChannelUserMuted(channel) {
    channel = parseInt(channel, 10);
    if (this.userMuteState.has(channel)) return !!this.userMuteState.get(channel);
    const chConfig = this.synth.channels[channel];
    return !!(chConfig && (chConfig.userMuted ?? chConfig.muted));
  }

  setChannelUserMute(channel, muted) {
    channel = parseInt(channel, 10);
    if (!this.synth.channels[channel]) return;
    const value = !!muted;
    this.userMuteState.set(channel, value);
    this.synth.channels[channel].userMuted = value;
    this.applyChannelAudibility(channel);
  }

  hasVisibleSolo() {
    for (let channel = 1; channel <= this.totalChannels; channel++) {
      if (this.synth.channels[channel] && this.synth.channels[channel].solo) return true;
    }
    return false;
  }

  applyChannelAudibility(channel, hasSolo = this.hasVisibleSolo()) {
    const chConfig = this.synth.channels[channel];
    if (!chConfig) return;
    const hidden = channel > this.totalChannels;
    const soloSuppressed = hasSolo && !chConfig.solo;
    const effectiveMuted = hidden || soloSuppressed || this.getChannelUserMuted(channel);
    chConfig.soloSuppressed = soloSuppressed;
    chConfig.visibilitySuppressed = hidden;
    this.synth.setChannelMute(channel, effectiveMuted);
    // setChannelMute escreve o mute efetivo; preservar separadamente a intenção.
    chConfig.userMuted = this.getChannelUserMuted(channel);
  }

  applyAllChannelAudibility() {
    const hasSolo = this.hasVisibleSolo();
    for (let channel = 1; channel <= 16; channel++) {
      this.applyChannelAudibility(channel, hasSolo);
    }
  }

  captureChannelState(channel) {
    const source = this.synth.channels[channel];
    if (!source) return null;
    return {
      name: source.name,
      volume: source.volume,
      pan: source.pan,
      muted: this.getChannelUserMuted(channel),
      solo: !!source.solo,
      transpose: source.transpose,
      semitoneTranspose: source.semitoneTranspose,
      assignedPresetIndex: source.assignedPresetIndex,
      assignedMidiChannel: source.assignedMidiChannel,
      keyRangeLow: source.keyRangeLow,
      keyRangeHigh: source.keyRangeHigh,
      adsr: source.adsr ? { ...source.adsr } : null,
      velocitySettings: source.velocitySettings ? { ...source.velocitySettings } : null
    };
  }

  applyChannelState(channel, state) {
    const target = this.synth.channels[channel];
    if (!target || !state) return;
    const volume = Number(state.volume);
    const pan = Number(state.pan);
    const low = Number(state.keyRangeLow);
    const high = Number(state.keyRangeHigh);
    if (typeof this.synth.setChannelName === 'function') this.synth.setChannelName(channel, String(state.name || `CH ${channel}`));
    if (typeof this.synth.setChannelVolume === 'function') {
      this.synth.setChannelVolume(channel, Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1)));
    }
    if (typeof this.synth.setChannelPan === 'function') {
      this.synth.setChannelPan(channel, Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0)));
    }
    if (typeof this.synth.setChannelPreset === 'function') this.synth.setChannelPreset(channel, state.assignedPresetIndex);
    target.transpose = Number.isFinite(Number(state.transpose)) ? Number(state.transpose) : 0;
    target.semitoneTranspose = Number.isFinite(Number(state.semitoneTranspose)) ? Number(state.semitoneTranspose) : 0;
    target.assignedMidiChannel = state.assignedMidiChannel === 'all'
      ? 'all'
      : Math.max(1, Math.min(16, parseInt(state.assignedMidiChannel, 10) || 1));
    target.keyRangeLow = Math.max(0, Math.min(127, Number.isFinite(low) ? Math.round(low) : 0));
    target.keyRangeHigh = Math.max(target.keyRangeLow, Math.min(127, Number.isFinite(high) ? Math.round(high) : 127));
    if (state.adsr) target.adsr = { ...state.adsr };
    if (state.velocitySettings) target.velocitySettings = { ...state.velocitySettings };
    target.solo = !!state.solo;
    this.setChannelUserMute(channel, !!state.muted);
  }

  resetChannelState(channel) {
    this.applyChannelState(channel, {
      name: `CH ${channel < 10 ? '0' + channel : channel}: LAYER ${channel}`,
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      transpose: 0,
      semitoneTranspose: 0,
      assignedPresetIndex: null,
      assignedMidiChannel: 'all',
      keyRangeLow: 0,
      keyRangeHigh: 127,
      adsr: { attack: 0.005, decay: 0.1, sustain: 0.75, release: 0.25 },
      velocitySettings: { useGlobal: true, mode: 'normal', minVel: 1, maxVel: 127, curvePower: 2, fixedVel: 120 }
    });
  }

  releaseMixerAnalysers() {
    if (!this.vuMeter || !this.vuMeter.analysers) return;
    Array.from(this.vuMeter.analysers.entries()).forEach(([id, analyser]) => {
      if (!String(id).startsWith('ch_')) return;
      const channel = parseInt(String(id).slice(3), 10);
      const gainNode = this.synth.channels[channel] && this.synth.channels[channel].gainNode;
      if (gainNode && typeof gainNode.disconnect === 'function') {
        try { gainNode.disconnect(analyser); } catch (error) {}
      }
      if (analyser && typeof analyser.disconnect === 'function') {
        try { analyser.disconnect(); } catch (error) {}
      }
      this.vuMeter.analysers.delete(id);
      if (this.vuMeter.canvases) this.vuMeter.canvases.delete(id);
    });
  }
}

window.MixerConsoleManager = MixerConsoleManager;
