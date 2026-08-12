/**
 * PRESET MANAGEMENT SYSTEM
 * Gerenciador de Presets: Salvar, Carregar, Importar/Exportar JSON e Persistência LocalStorage (com nomes de pistas customizados).
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
        1: { name: 'Grand Piano', volume: 0.85, pan: 0, muted: false, solo: false, transpose: 0 },
        2: { name: 'Soft Strings', volume: 0.45, pan: 0.2, muted: false, solo: false, transpose: 0 }
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
        1: { name: 'EPiano Stage', volume: 0.9, pan: -0.1, muted: false, solo: false, transpose: 0 },
        2: { name: 'Pad Layer', volume: 0, pan: 0, muted: true, solo: false, transpose: 0 }
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
        1: { name: 'Lead Synth', volume: 0.95, pan: -0.25, muted: false, solo: false, transpose: 0 },
        2: { name: 'Brass Solo', volume: 0.75, pan: 0.25, muted: false, solo: false, transpose: 1 }
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
          name: chData.name || `CH ${ch < 10 ? '0' + ch : ch}: LAYER ${ch}`,
          volume: chData.volume,
          pan: chData.pan,
          muted: chData.muted,
          solo: chData.solo,
          transpose: chData.transpose,
          assignedPresetIndex: chData.assignedPresetIndex,
          assignedMidiChannel: chData.assignedMidiChannel
        };
      }
    }

    return {
      name: presetName,
      timestamp: new Date().toISOString(),
      polyphony: this.synth.isAutoPolyphony ? 'auto' : this.synth.maxPolyphony,
      velocityCurve: this.synth.velocityCurve,
      channels: channelsState,
      masterFx: {
        eqLow: this.fxRack.masterParams ? this.fxRack.masterParams.eqLow : 0,
        eqMid: this.fxRack.masterParams ? this.fxRack.masterParams.eqMid : 0,
        eqHigh: this.fxRack.masterParams ? this.fxRack.masterParams.eqHigh : 0,
        delayTime: this.fxRack.masterParams ? this.fxRack.masterParams.delayTime : 300,
        delayMix: this.fxRack.masterParams ? this.fxRack.masterParams.delayMix : 20,
        reverbSize: this.fxRack.masterParams ? this.fxRack.masterParams.reverbSize : 40,
        reverbMix: this.fxRack.masterParams ? this.fxRack.masterParams.reverbMix : 25
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

    this.exportPresetToJson(presetData);
    alert(`Preset "${name}" salvo com sucesso!`);
    return presetData;
  }

  loadPreset(presetData) {
    if (!presetData) return;

    console.log(`[PresetManager] Carregando preset: ${presetData.name}`);

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

    if (presetData.channels) {
      Object.keys(presetData.channels).forEach((chKey) => {
        const ch = parseInt(chKey, 10);
        const chData = presetData.channels[chKey];

        if (chData.name) {
          this.synth.setChannelName(ch, chData.name);
        }
        this.synth.setChannelVolume(ch, chData.volume);
        this.synth.setChannelPan(ch, chData.pan);
        this.synth.setChannelMute(ch, chData.muted);
        if (this.synth.channels[ch]) {
          this.synth.channels[ch].transpose = chData.transpose;
          if (chData.assignedPresetIndex !== undefined) {
            this.synth.setChannelPreset(ch, chData.assignedPresetIndex);
          }
          if (chData.assignedMidiChannel !== undefined) {
            this.synth.channels[ch].assignedMidiChannel = chData.assignedMidiChannel;
          }
        }
      });
      this.mixer.renderMixer();
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
