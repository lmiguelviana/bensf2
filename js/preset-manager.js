/**
 * PRESET MANAGEMENT SYSTEM
 * Gerenciador de Presets: Salvar, Carregar, Importar/Exportar JSON e Persistência LocalStorage.
 */

class PresetManager {
  constructor(synthEngine, fxRackManager, mixerManager) {
    this.synth = synthEngine;
    this.fxRack = fxRackManager;
    this.mixer = mixerManager;

    this.userPresets = new Map(); // name -> presetData
    this.factoryPresets = new Map();

    this.initFactoryPresets();
    this.loadUserPresetsFromStorage();
  }

  initFactoryPresets() {
    this.factoryPresets.set('factory_1', {
      name: '01 - Grand Piano + Soft Strings',
      polyphony: 'auto',
      velocityCurve: 'normal',
      channels: {
        1: { volume: 0.85, pan: 0, muted: false, solo: false, transpose: 0 },
        2: { volume: 0.45, pan: 0.2, muted: false, solo: false, transpose: 0 }
      },
      fx: {
        eqLow: 2.0, eqMid: 0, eqHigh: 1.5,
        delayTime: 0.3, delayMix: 0.15,
        reverbSize: 0.4, reverbMix: 0.25
      }
    });

    this.factoryPresets.set('factory_2', {
      name: '02 - EPiano Stage + Stereo Reverb',
      polyphony: 'auto',
      velocityCurve: 'soft',
      channels: {
        1: { volume: 0.9, pan: -0.1, muted: false, solo: false, transpose: 0 },
        2: { volume: 0, pan: 0, muted: true, solo: false, transpose: 0 }
      },
      fx: {
        eqLow: 1.0, eqMid: 1.5, eqHigh: 3.0,
        delayTime: 0.25, delayMix: 0.25,
        reverbSize: 0.6, reverbMix: 0.45
      }
    });

    this.factoryPresets.set('factory_3', {
      name: '03 - Lead Synth + Brass Layer',
      polyphony: 'auto',
      velocityCurve: 'hard',
      channels: {
        1: { volume: 0.95, pan: -0.25, muted: false, solo: false, transpose: 0 },
        2: { volume: 0.75, pan: 0.25, muted: false, solo: false, transpose: 1 }
      },
      fx: {
        eqLow: 3.0, eqMid: 2.0, eqHigh: 2.0,
        delayTime: 0.4, delayMix: 0.35,
        reverbSize: 0.5, reverbMix: 0.3
      }
    });
  }

  getCurrentState(presetName = 'Novo Preset') {
    const channelsState = {};
    for (let ch = 1; ch <= this.mixer.totalChannels; ch++) {
      const chData = this.synth.channels[ch];
      if (chData) {
        channelsState[ch] = {
          volume: chData.volume,
          pan: chData.pan,
          muted: chData.muted,
          solo: chData.solo,
          transpose: chData.transpose
        };
      }
    }

    return {
      name: presetName,
      timestamp: new Date().toISOString(),
      polyphony: this.synth.isAutoPolyphony ? 'auto' : this.synth.maxPolyphony,
      velocityCurve: this.synth.velocityCurve,
      channels: channelsState,
      fx: {
        eqLow: this.fxRack.eqLow ? this.fxRack.eqLow.gain.value : 0,
        eqMid: this.fxRack.eqMid ? this.fxRack.eqMid.gain.value : 0,
        eqHigh: this.fxRack.eqHigh ? this.fxRack.eqHigh.gain.value : 0,
        delayTime: this.fxRack.delayTime,
        delayMix: this.fxRack.delayMix,
        reverbSize: this.fxRack.reverbSize,
        reverbMix: this.fxRack.reverbMix
      }
    };
  }

  savePreset(name) {
    if (!name || name.trim() === '') {
      name = prompt('Digite um nome para o seu Preset personalizado:', 'Meu Preset Live');
    }
    if (!name) return;

    const presetData = this.getCurrentState(name.trim());
    this.userPresets.set(name.trim(), presetData);
    this.saveUserPresetsToStorage();

    // Exportar também arquivo .json baixável
    this.exportPresetToJson(presetData);
    alert(`Preset "${name}" salvo com sucesso!`);
    return presetData;
  }

  loadPreset(presetData) {
    if (!presetData) return;

    console.log(`[PresetManager] Carregando preset: ${presetData.name}`);

    // Restaurar Polifonia e Velocidade
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

    // Restaurar Canais do Mixer
    if (presetData.channels) {
      Object.keys(presetData.channels).forEach((chKey) => {
        const ch = parseInt(chKey, 10);
        const chData = presetData.channels[chKey];

        this.synth.setChannelVolume(ch, chData.volume);
        this.synth.setChannelPan(ch, chData.pan);
        this.synth.setChannelMute(ch, chData.muted);
        if (this.synth.channels[ch]) {
          this.synth.channels[ch].transpose = chData.transpose;
        }
      });
      this.mixer.renderMixer(); // Atualizar faders e knobs na UI
    }

    // Restaurar FX Rack
    if (presetData.fx) {
      const fx = presetData.fx;
      this.fxRack.setEqLowGain(fx.eqLow || 0);
      this.fxRack.setEqMidGain(fx.eqMid || 0);
      this.fxRack.setEqHighGain(fx.eqHigh || 0);

      this.fxRack.setDelayTime(fx.delayTime || 0.3);
      this.fxRack.setDelayMix(fx.delayMix || 0.2);

      this.fxRack.setReverbSize(fx.reverbSize || 0.4);
      this.fxRack.setReverbMix(fx.reverbMix || 0.25);

      // Atualizar Sliders de FX na UI
      this.updateFxSlidersUI(fx);
    }
  }

  updateFxSlidersUI(fx) {
    const setVal = (id, valElId, val, unit = '') => {
      const el = document.getElementById(id);
      const txt = document.getElementById(valElId);
      if (el) el.value = val;
      if (txt) txt.textContent = `${val}${unit}`;
    };

    setVal('eqLowGain', 'eqLowVal', fx.eqLow || 0, ' dB');
    setVal('eqMidGain', 'eqMidVal', fx.eqMid || 0, ' dB');
    setVal('eqHighGain', 'eqHighVal', fx.eqHigh || 0, ' dB');

    setVal('delayTime', 'delayTimeVal', fx.delayTime || 0.3, ' s');
    setVal('delayMix', 'delayMixVal', Math.round((fx.delayMix || 0.2) * 100), '%');

    setVal('fxReverbSize', 'reverbSizeVal', Math.round((fx.reverbSize || 0.4) * 100), '%');
    setVal('fxReverbMix', 'reverbMixVal', Math.round((fx.reverbMix || 0.25) * 100), '%');
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
          alert(`Preset "${presetData.name}" importado e carregado com sucesso!`);
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
    } catch (e) {}
  }

  loadUserPresetsFromStorage() {
    try {
      const jsonStr = localStorage.getItem('sf2_user_presets');
      if (jsonStr) {
        const arr = JSON.parse(jsonStr);
        arr.forEach((p) => this.userPresets.set(p.name, p));
      }
    } catch (e) {}
  }
}

window.PresetManager = PresetManager;
