/**
 * PRESET MANAGEMENT SYSTEM
 * Gerenciador de Presets Completo: Captura 100% do estado do Live Rig (pistas visíveis, timbres, faders, knobs FX, botões M/S, splits, transposição, ADSR, master FX)
 * com alerta amigável de localização de arquivo .SF2 quando um timbre não estiver presente na biblioteca.
 */

class PresetManager {
  constructor(synthEngine, fxRackManager, mixerManager) {
    this.synth = synthEngine;
    this.fxRack = fxRackManager;
    this.mixer = mixerManager;

    this.userPresets = new Map(); // name -> presetData
    this.loadUserPresetsFromStorage();
    this.updatePresetDropdownUI();
  }

  getCurrentState(presetName = 'Novo Preset') {
    const channelsState = {};
    const visibleCount = this.mixer ? this.mixer.totalChannels : 4;

    for (let ch = 1; ch <= 16; ch++) {
      const chData = this.synth.channels[ch];
      if (chData) {
        // Capturar metadados do timbre atribuído à pista
        let timbreInfo = null;
        if (chData.assignedPresetIndex !== null && chData.assignedPresetIndex !== undefined &&
          this.synth.parsedSf2Data && this.synth.parsedSf2Data.presets &&
          this.synth.parsedSf2Data.presets[chData.assignedPresetIndex]) {
          const p = this.synth.parsedSf2Data.presets[chData.assignedPresetIndex];
          timbreInfo = {
            name: p.name,
            bank: p.bank,
            preset: p.preset,
            sf2Source: p.sf2Source || ''
          };
        }

        const trackFxData = (this.fxRack && this.fxRack.trackParams && this.fxRack.trackParams[ch]) ? { ...this.fxRack.trackParams[ch] } : {};

        channelsState[ch] = {
          name: chData.name || `CH ${ch < 10 ? '0' + ch : ch}: LAYER ${ch}`,
          volume: chData.volume,
          pan: chData.pan,
          muted: chData.muted,
          solo: chData.solo,
          transpose: chData.transpose,
          semitoneTranspose: chData.semitoneTranspose || 0,
          keyRangeLow: chData.keyRangeLow !== undefined ? chData.keyRangeLow : 0,
          keyRangeHigh: chData.keyRangeHigh !== undefined ? chData.keyRangeHigh : 127,
          assignedMidiChannel: chData.assignedMidiChannel,
          assignedPresetIndex: chData.assignedPresetIndex,
          timbreInfo: timbreInfo,
          adsr: chData.adsr ? { ...chData.adsr } : { attack: 0.005, decay: 0.1, sustain: 0.75, release: 0.25 },
          trackFx: trackFxData
        };
      }
    }

    const masterFxState = (this.fxRack && this.fxRack.masterParams) ? { ...this.fxRack.masterParams } : {};

    return {
      name: presetName,
      timestamp: new Date().toISOString(),
      polyphony: this.synth.isAutoPolyphony ? 'auto' : this.synth.maxPolyphony,
      velocityCurve: this.synth.velocityCurve,
      totalChannels: visibleCount,
      channels: channelsState,
      masterFx: masterFxState
    };
  }

  createNewPreset(name) {
    if (!name || typeof name !== 'string' || name.trim() === '') return null;
    const cleanName = name.trim();
    const presetData = this.getCurrentState(cleanName);
    this.userPresets.set(cleanName, presetData);
    this.activePresetName = cleanName;
    this.saveUserPresetsToStorage();
    this.updatePresetDropdownUI();

    const selectEl = document.getElementById('presetSelect');
    if (selectEl) selectEl.value = cleanName;

    if (window.showToastNotification) {
      window.showToastNotification('Preset Criado!', `Preset "${cleanName}" salvo com sucesso.`, 'success');
    }
    return presetData;
  }

  saveActivePreset() {
    let name = this.activePresetName;
    const selectEl = document.getElementById('presetSelect');
    if (!name && selectEl && selectEl.value && selectEl.value !== '(nenhum preset salvo)') {
      name = selectEl.value;
    }

    if (!name) {
      const modal = document.getElementById('newPresetNameModal');
      if (modal) modal.style.display = 'flex';
      return;
    }

    const presetData = this.getCurrentState(name);
    this.userPresets.set(name, presetData);
    this.activePresetName = name;
    this.saveUserPresetsToStorage();
    this.updatePresetDropdownUI();

    if (window.showToastNotification) {
      window.showToastNotification('Preset Salvo!', `Configuração "${name}" atualizada com sucesso.`, 'success');
    }
  }

  async openPresetFileDialog() {
    if (window.electronAPI && window.electronAPI.showOpenDialog) {
      try {
        const filePath = await window.electronAPI.showOpenDialog({
          title: 'Importar Preset JSON',
          filters: [{ name: 'Arquivo Preset JSON', extensions: ['json'] }],
          properties: ['openFile']
        });
        if (filePath && window.electronAPI.readFile) {
          const content = await window.electronAPI.readFile(filePath);
          if (content) {
            const presetData = JSON.parse(content);
            if (presetData.name && presetData.channels) {
              this.userPresets.set(presetData.name, presetData);
              this.activePresetName = presetData.name;
              this.saveUserPresetsToStorage();
              this.loadPreset(presetData);
              if (window.showToastNotification) {
                window.showToastNotification('Preset Importado!', `Preset "${presetData.name}" carregado com sucesso.`, 'success');
              }
            }
          }
        }
      } catch (e) {
        console.error('[PresetManager] Erro ao abrir diálogo de arquivo:', e);
      }
    } else {
      const fileInput = document.getElementById('presetFileInput');
      if (fileInput) fileInput.click();
    }
  }

  savePreset(name) {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return this.saveActivePreset();
    }
    return this.createNewPreset(name);
  }

  loadPreset(presetData) {
    if (!presetData) return;

    this.activePresetName = presetData.name;
    console.log(`[PresetManager] Carregando preset: ${presetData.name}`);

    // 1. Restaurar quantidade de canais visíveis no Mixer
    if (presetData.totalChannels && this.mixer) {
      this.mixer.setVisibleChannelCount(presetData.totalChannels);
      const chanSelect = document.getElementById('mixerChannelCountSelect');
      if (chanSelect) chanSelect.value = presetData.totalChannels;
    }

    // 2. Restaurar Polifonia e Curva de Velocidade
    if (presetData.polyphony) {
      this.synth.setMaxPolyphony(presetData.polyphony);
      const polySelect = document.getElementById('polyphonySelect');
      if (polySelect) polySelect.value = presetData.polyphony;
    }

    if (presetData.velocityCurve) {
      this.synth.setVelocityCurve(presetData.velocityCurve);
      const velSelect = document.getElementById('velocityCurveSelect');
      if (velSelect) velSelect.value = presetData.velocityCurve;
    }

    // 3. Restaurar Master FX (Efeitos e Estados dos Botões ON/OFF)
    if (presetData.masterFx && this.fxRack) {
      const m = presetData.masterFx;
      if (m.eqEnabled !== undefined) this.fxRack.toggleMasterEq(m.eqEnabled);
      if (m.eqLow !== undefined) this.fxRack.setMasterEqLowGain(m.eqLow);
      if (m.eqMid !== undefined) this.fxRack.setMasterEqMidGain(m.eqMid);
      if (m.eqHigh !== undefined) this.fxRack.setMasterEqHighGain(m.eqHigh);

      if (m.chorusEnabled !== undefined) this.fxRack.toggleMasterChorus(m.chorusEnabled);
      if (m.chorusMix !== undefined) this.fxRack.setMasterChorusMix(m.chorusMix);

      if (m.delayEnabled !== undefined) this.fxRack.toggleMasterDelay(m.delayEnabled);
      if (m.delayTime !== undefined) this.fxRack.setMasterDelayTime(m.delayTime / 1000.0);
      if (m.delayMix !== undefined) this.fxRack.setMasterDelayMix(m.delayMix);

      if (m.reverbEnabled !== undefined) this.fxRack.toggleMasterReverb(m.reverbEnabled);
      if (m.reverbMode !== undefined) this.fxRack.setMasterReverbMode(m.reverbMode);
      if (m.reverbSize !== undefined) this.fxRack.setMasterReverbSize(m.reverbSize);
      if (m.reverbMix !== undefined) this.fxRack.setMasterReverbMix(m.reverbMix);
    }

    // 4. Restaurar Canais (1..16)
    const missingTimbres = [];

    if (presetData.channels) {
      Object.keys(presetData.channels).forEach((chKey) => {
        const ch = parseInt(chKey, 10);
        const chData = presetData.channels[chKey];

        if (this.synth.channels[ch]) {
          if (chData.name) this.synth.setChannelName(ch, chData.name);
          if (chData.volume !== undefined) this.synth.setChannelVolume(ch, chData.volume);
          if (chData.pan !== undefined) this.synth.setChannelPan(ch, chData.pan);
          if (chData.muted !== undefined) this.synth.setChannelMute(ch, chData.muted);

          this.synth.channels[ch].solo = !!chData.solo;
          this.synth.channels[ch].transpose = chData.transpose !== undefined ? chData.transpose : 0;
          this.synth.channels[ch].semitoneTranspose = chData.semitoneTranspose !== undefined ? chData.semitoneTranspose : 0;
          this.synth.channels[ch].keyRangeLow = chData.keyRangeLow !== undefined ? chData.keyRangeLow : 0;
          this.synth.channels[ch].keyRangeHigh = chData.keyRangeHigh !== undefined ? chData.keyRangeHigh : 127;
          this.synth.channels[ch].assignedMidiChannel = chData.assignedMidiChannel !== undefined ? chData.assignedMidiChannel : 'all';

          // Restaurar ADSR da pista
          if (chData.adsr) {
            this.synth.channels[ch].adsr = { ...chData.adsr };
          }

          // Restaurar FX da pista
          if (chData.trackFx && this.fxRack && this.fxRack.trackParams[ch]) {
            const tf = chData.trackFx;
            Object.assign(this.fxRack.trackParams[ch], tf);
          }

          // Localizar timbre no banco atual ou marcar como ausente
          let resolvedIndex = null;

          if (chData.timbreInfo) {
            if (this.synth.parsedSf2Data && this.synth.parsedSf2Data.presets) {
              const matchedIdx = this.synth.parsedSf2Data.presets.findIndex(p => {
                const nameMatch = p.name === chData.timbreInfo.name;
                const sourceMatch = !chData.timbreInfo.sf2Source || !p.sf2Source || p.sf2Source === chData.timbreInfo.sf2Source;
                return nameMatch && sourceMatch;
              });

              if (matchedIdx !== -1) {
                resolvedIndex = matchedIdx;
              } else {
                missingTimbres.push({
                  ch: ch,
                  name: chData.timbreInfo.name,
                  sf2Source: chData.timbreInfo.sf2Source
                });
              }
            } else {
              missingTimbres.push({
                ch: ch,
                name: chData.timbreInfo.name,
                sf2Source: chData.timbreInfo.sf2Source
              });
            }
          } else if (chData.assignedPresetIndex !== undefined && chData.assignedPresetIndex !== null) {
            if (this.synth.parsedSf2Data && this.synth.parsedSf2Data.presets && this.synth.parsedSf2Data.presets[chData.assignedPresetIndex]) {
              resolvedIndex = chData.assignedPresetIndex;
            }
          }

          this.synth.setChannelPreset(ch, resolvedIndex);
        }
      });
    }

    // 5. Renderizar o Mixer com faders, botões e valores atualizados
    if (this.mixer) {
      this.mixer.renderMixer();
    }

    if (this.fxRack) {
      this.fxRack.notifySelectionChange();
    }

    this.updatePresetDropdownUI();
    const selectEl = document.getElementById('presetSelect');
    if (selectEl && presetData.name) {
      selectEl.value = presetData.name;
    }

    // 6. Se houver timbres ausentes (arquivo SF2 não carregado), alertar o usuário
    if (missingTimbres.length > 0) {
      const missingList = missingTimbres.map(m => `Pista CH ${m.ch}: "${m.name}" (${m.sf2Source ? m.sf2Source + '.sf2' : 'SF2'})`).join('\n');

      if (window.showToastNotification) {
        window.showToastNotification(
          'Timbres Ausentes no Banco',
          `${missingTimbres.length} timbre(s) do preset não foram encontrados na biblioteca. Por favor, carregue os arquivos .SF2!`,
          'warning'
        );
      }

      setTimeout(() => {
        const wantsToLoad = confirm(
          `⚠️ Os seguintes timbres do Preset "${presetData.name}" não foram encontrados no banco atual:\n\n${missingList}\n\nDeseja abrir o seletor para carregar os arquivos .SF2 agora?`
        );
        if (wantsToLoad) {
          const sf2Input = document.getElementById('sf2FileInput');
          if (sf2Input) sf2Input.click();
        }
      }, 400);
    }
  }

  exportPresetToJson(presetData) {
    const jsonStr = JSON.stringify(presetData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${presetData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_preset.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importPresetFromJsonFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const presetData = JSON.parse(e.target.result);
        if (presetData.name && presetData.channels) {
          this.userPresets.set(presetData.name, presetData);
          this.saveUserPresetsToStorage();
          this.loadPreset(presetData);
          if (window.showToastNotification) {
            window.showToastNotification('Preset Importado!', `Preset "${presetData.name}" carregado com sucesso.`);
          }
        } else {
          alert('Arquivo de preset inválido.');
        }
      } catch (err) {
        alert('Erro ao importar arquivo JSON de preset: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  saveUserPresetsToStorage() {
    try {
      const arr = Array.from(this.userPresets.values());
      localStorage.setItem('sf2_user_presets', JSON.stringify(arr));
    } catch (e) { }
  }

  loadUserPresetsFromStorage() {
    try {
      const jsonStr = localStorage.getItem('sf2_user_presets');
      if (jsonStr) {
        const arr = JSON.parse(jsonStr);
        arr.forEach((p) => this.userPresets.set(p.name, p));
      }
    } catch (e) { }
  }

  updatePresetDropdownUI() {
    const selectEl = document.getElementById('presetSelect');
    if (!selectEl) return;

    const currentVal = selectEl.value;
    selectEl.innerHTML = '';

    const userPresetList = Array.from(this.userPresets.values());

    if (userPresetList.length === 0) {
      selectEl.innerHTML = `<option value="" disabled selected>(nenhum preset salvo)</option>`;
    } else {
      userPresetList.forEach((p) => {
        const option = document.createElement('option');
        option.value = p.name;
        option.textContent = p.name;
        if (p.name === currentVal) option.selected = true;
        selectEl.appendChild(option);
      });
    }
  }
}

window.PresetManager = PresetManager;

