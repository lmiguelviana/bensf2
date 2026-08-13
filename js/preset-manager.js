/**
 * PRESET MANAGEMENT SYSTEM
 * Estado de rig versionado, validado e compartilhado por Presets e Setlists.
 */
class PresetManager {
  static get SCHEMA_VERSION() { return 2; }
  static get STATE_KIND() { return 'bensf2-rig-state'; }

  constructor(synthEngine, fxRackManager, mixerManager) {
    this.synth = synthEngine;
    this.fxRack = fxRackManager;
    this.mixer = mixerManager;
    this.userPresets = new Map();
    this.activePresetName = null;
    this.loadUserPresetsFromStorage();
    this.updatePresetDropdownUI();
  }

  clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : fallback));
  }

  cleanText(value, fallback = '', maxLength = 160) {
    if (typeof value !== 'string') return fallback;
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return (clean || fallback).slice(0, maxLength);
  }

  normalizeVelocitySettings(input, fallback = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const allowedModes = new Set(['normal', 'soft', 'hard', 'compressed', 'fixed', 'custom']);
    let minVel = Math.round(this.clampNumber(source.minVel, 1, 127, fallback.minVel || 1));
    let maxVel = Math.round(this.clampNumber(source.maxVel, 1, 127, fallback.maxVel || 127));
    if (minVel > maxVel) [minVel, maxVel] = [maxVel, minVel];
    const modeCandidate = this.cleanText(source.mode, fallback.mode || 'normal', 24);
    return {
      useGlobal: source.useGlobal === undefined ? fallback.useGlobal !== false : !!source.useGlobal,
      mode: allowedModes.has(modeCandidate) ? modeCandidate : 'normal',
      minVel,
      maxVel,
      curvePower: this.clampNumber(source.curvePower, 0.1, 8, fallback.curvePower || 2),
      fixedVel: Math.round(this.clampNumber(source.fixedVel, 1, 127, fallback.fixedVel || 120)),
      ...(typeof source.curveId === 'string' ? { curveId: this.cleanText(source.curveId, '', 100) } : {})
    };
  }

  normalizeFxState(input, legacy = false, master = false) {
    const source = input && typeof input === 'object' ? input : {};
    const normalizeRatio = (value, fallback) => {
      let numeric = Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      if (legacy && numeric > 1) numeric /= 100;
      return this.clampNumber(numeric, 0, 1, fallback);
    };
    const normalizeSeconds = (value, fallback) => {
      let numeric = Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      if (legacy && numeric > 1) numeric /= 1000;
      return this.clampNumber(numeric, 0, 1, fallback);
    };
    const modes = this.fxRack && this.fxRack.reverbModes
      ? new Set(Object.keys(this.fxRack.reverbModes))
      : new Set(['concert_hall', 'bright_hall', 'plate', 'room', 'chamber', 'cathedral', 'sanctuary', 'synth_space']);
    const mode = this.cleanText(source.reverbMode, 'concert_hall', 40);
    const normalized = {
      eqEnabled: !!source.eqEnabled,
      chorusEnabled: !!source.chorusEnabled,
      delayEnabled: !!source.delayEnabled,
      reverbEnabled: !!source.reverbEnabled,
      eqLow: this.clampNumber(source.eqLow, -24, 24, 0),
      eqMid: this.clampNumber(source.eqMid, -24, 24, 0),
      eqHigh: this.clampNumber(source.eqHigh, -24, 24, 0),
      chorusRate: this.clampNumber(source.chorusRate, 0.05, 20, 1.5),
      chorusMix: normalizeRatio(source.chorusMix, 0.3),
      delayTime: normalizeSeconds(source.delayTime, 0.3),
      delayMix: normalizeRatio(source.delayMix, 0.2),
      reverbSize: normalizeRatio(source.reverbSize, 0.4),
      reverbMix: normalizeRatio(source.reverbMix, 0.25),
      reverbMode: modes.has(mode) ? mode : 'concert_hall'
    };
    if (!master) {
      normalized.cutoffEnabled = !!source.cutoffEnabled;
      normalized.cutoffFreq = this.clampNumber(source.cutoffFreq, 20, 20000, 20000);
    }
    return normalized;
  }

  normalizeTimbreInfo(input) {
    if (!input || typeof input !== 'object') return null;
    const name = this.cleanText(input.name, '', 120);
    const sf2Source = this.cleanText(input.sf2Source, '', 180);
    const bank = Math.round(this.clampNumber(input.bank, 0, 16383, 0));
    const preset = Math.round(this.clampNumber(input.preset, 0, 127, 0));
    return name || sf2Source ? { name, bank, preset, sf2Source } : null;
  }

  normalizeChannelState(input, channel, legacy) {
    const source = input && typeof input === 'object' ? input : {};
    const low = Math.round(this.clampNumber(source.keyRangeLow, 0, 127, 0));
    const highRaw = Math.round(this.clampNumber(source.keyRangeHigh, 0, 127, 127));
    const midiChannel = source.assignedMidiChannel === 'all'
      ? 'all'
      : Math.round(this.clampNumber(source.assignedMidiChannel, 1, 16, 1));
    const parsedPreset = Number(source.assignedPresetIndex);
    const assignedPresetIndex = source.assignedPresetIndex === null || source.assignedPresetIndex === undefined || !Number.isInteger(parsedPreset) || parsedPreset < 0
      ? null
      : parsedPreset;
    const adsr = source.adsr && typeof source.adsr === 'object' ? source.adsr : {};
    return {
      name: this.cleanText(source.name, `CH ${channel < 10 ? '0' + channel : channel}: LAYER ${channel}`, 120),
      volume: this.clampNumber(source.volume, 0, 1, 1),
      pan: this.clampNumber(source.pan, -1, 1, 0),
      muted: !!source.muted,
      solo: !!source.solo,
      transpose: Math.round(this.clampNumber(source.transpose, -8, 8, 0)),
      semitoneTranspose: Math.round(this.clampNumber(source.semitoneTranspose, -24, 24, 0)),
      keyRangeLow: Math.min(low, highRaw),
      keyRangeHigh: Math.max(low, highRaw),
      assignedMidiChannel: midiChannel,
      assignedPresetIndex,
      timbreInfo: this.normalizeTimbreInfo(source.timbreInfo),
      adsr: {
        attack: this.clampNumber(adsr.attack, 0.001, 10, 0.005),
        decay: this.clampNumber(adsr.decay, 0.001, 10, 0.1),
        sustain: this.clampNumber(adsr.sustain, 0, 1, 0.75),
        release: this.clampNumber(adsr.release, 0, 20, 0.25)
      },
      velocitySettings: this.normalizeVelocitySettings(source.velocitySettings, { useGlobal: true }),
      trackFx: this.normalizeFxState(source.trackFx, legacy, false)
    };
  }

  normalizeRigState(input, fallbackName = 'Preset Importado') {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('O preset precisa ser um objeto JSON.');
    }
    if (!input.channels || typeof input.channels !== 'object') {
      throw new Error('O preset não contém canais válidos.');
    }
    const legacy = Number(input.schemaVersion) !== PresetManager.SCHEMA_VERSION;
    const channels = {};
    const channelEntries = Array.isArray(input.channels)
      ? input.channels.map((value, index) => [value && value.channel !== undefined ? value.channel : index + 1, value])
      : Object.entries(input.channels);
    channelEntries.forEach(([key, value]) => {
      const channel = parseInt(key, 10);
      if (channel >= 1 && channel <= 16) channels[channel] = this.normalizeChannelState(value, channel, legacy);
    });
    if (Object.keys(channels).length === 0) throw new Error('O preset não contém canais entre 1 e 16.');
    const polyphony = input.polyphony === 'auto'
      ? 'auto'
      : Math.round(this.clampNumber(input.polyphony, 1, 256, 64));
    const globalVelocitySettings = this.normalizeVelocitySettings(
      input.globalVelocitySettings || { mode: input.velocityCurve },
      { useGlobal: true, mode: 'normal' }
    );
    globalVelocitySettings.useGlobal = true;
    return {
      schemaVersion: PresetManager.SCHEMA_VERSION,
      kind: PresetManager.STATE_KIND,
      name: this.cleanText(input.name, fallbackName, 120),
      timestamp: typeof input.timestamp === 'string' ? input.timestamp : new Date().toISOString(),
      polyphony,
      velocityCurve: globalVelocitySettings.mode,
      globalVelocitySettings,
      totalChannels: Math.round(this.clampNumber(input.totalChannels, 1, 16, Math.min(16, Object.keys(channels).length || 4))),
      channels,
      masterFx: this.normalizeFxState(input.masterFx, legacy, true)
    };
  }

  getCurrentState(presetName = 'Novo Preset') {
    const channels = {};
    for (let channel = 1; channel <= 16; channel++) {
      const source = this.synth.channels[channel];
      if (!source) continue;
      let timbreInfo = null;
      const presets = this.synth.parsedSf2Data && this.synth.parsedSf2Data.presets;
      if (source.assignedPresetIndex !== null && presets && presets[source.assignedPresetIndex]) {
        const preset = presets[source.assignedPresetIndex];
        timbreInfo = {
          name: preset.name,
          bank: preset.bank,
          preset: preset.preset,
          sf2Source: preset.sf2Source || ''
        };
      }
      channels[channel] = {
        name: source.name,
        volume: source.volume,
        pan: source.pan,
        muted: this.mixer && typeof this.mixer.getChannelUserMuted === 'function'
          ? this.mixer.getChannelUserMuted(channel)
          : !!(source.userMuted ?? source.muted),
        solo: !!source.solo,
        transpose: source.transpose,
        semitoneTranspose: source.semitoneTranspose,
        keyRangeLow: source.keyRangeLow,
        keyRangeHigh: source.keyRangeHigh,
        assignedMidiChannel: source.assignedMidiChannel,
        assignedPresetIndex: source.assignedPresetIndex,
        timbreInfo,
        adsr: source.adsr ? { ...source.adsr } : undefined,
        velocitySettings: source.velocitySettings ? { ...source.velocitySettings } : undefined,
        trackFx: this.fxRack && typeof this.fxRack.getTrackState === 'function'
          ? this.fxRack.getTrackState(channel)
          : {}
      };
    }
    return this.normalizeRigState({
      schemaVersion: PresetManager.SCHEMA_VERSION,
      kind: PresetManager.STATE_KIND,
      name: presetName,
      timestamp: new Date().toISOString(),
      polyphony: this.synth.isAutoPolyphony ? 'auto' : this.synth.maxPolyphony,
      globalVelocitySettings: this.synth.globalVelocitySettings,
      totalChannels: this.mixer ? this.mixer.totalChannels : 4,
      channels,
      masterFx: this.fxRack && typeof this.fxRack.getMasterState === 'function'
        ? this.fxRack.getMasterState()
        : {}
    }, presetName);
  }

  captureRigState(name = 'Snapshot do Rig') {
    return this.getCurrentState(name);
  }

  resolveTimbreIndex(channelState) {
    const presets = this.synth.parsedSf2Data && this.synth.parsedSf2Data.presets;
    if (!Array.isArray(presets)) return null;
    const info = channelState.timbreInfo;
    if (info) {
      const exact = presets.findIndex(candidate =>
        Number(candidate.bank) === info.bank &&
        Number(candidate.preset) === info.preset &&
        String(candidate.name || '') === info.name &&
        String(candidate.sf2Source || '') === info.sf2Source
      );
      if (exact >= 0) return exact;
      const bankProgram = presets.findIndex(candidate =>
        Number(candidate.bank) === info.bank &&
        Number(candidate.preset) === info.preset &&
        (!info.sf2Source || String(candidate.sf2Source || '') === info.sf2Source)
      );
      if (bankProgram >= 0) return bankProgram;
      return null;
    }
    const index = channelState.assignedPresetIndex;
    return index !== null && presets[index] ? index : null;
  }

  _applyNormalizedState(state, options = {}) {
    const missingTimbres = [];
    if (this.mixer && typeof this.mixer.setVisibleChannelCount === 'function') {
      this.mixer.setVisibleChannelCount(state.totalChannels, false);
    }
    if (typeof this.synth.setMaxPolyphony === 'function') this.synth.setMaxPolyphony(state.polyphony);
    if (typeof this.synth.setVelocityCurve === 'function') this.synth.setVelocityCurve(state.velocityCurve);
    if (this.synth.globalVelocitySettings) Object.assign(this.synth.globalVelocitySettings, state.globalVelocitySettings);
    if (this.fxRack && typeof this.fxRack.applyMasterState === 'function') this.fxRack.applyMasterState(state.masterFx);

    Object.entries(state.channels).forEach(([key, channelState]) => {
      const channel = parseInt(key, 10);
      const target = this.synth.channels[channel];
      if (!target) return;
      this.synth.setChannelName(channel, channelState.name);
      this.synth.setChannelVolume(channel, channelState.volume);
      this.synth.setChannelPan(channel, channelState.pan);
      target.transpose = channelState.transpose;
      target.semitoneTranspose = channelState.semitoneTranspose;
      target.keyRangeLow = channelState.keyRangeLow;
      target.keyRangeHigh = channelState.keyRangeHigh;
      target.assignedMidiChannel = channelState.assignedMidiChannel;
      target.adsr = { ...channelState.adsr };
      target.velocitySettings = { ...channelState.velocitySettings };
      target.solo = channelState.solo;
      const resolvedIndex = this.resolveTimbreIndex(channelState);
      this.synth.setChannelPreset(channel, resolvedIndex);
      if (channelState.timbreInfo && resolvedIndex === null) {
        missingTimbres.push({ channel, ...channelState.timbreInfo });
      }
      if (this.fxRack && typeof this.fxRack.applyTrackState === 'function') {
        this.fxRack.applyTrackState(channel, channelState.trackFx);
      }
      if (this.mixer && typeof this.mixer.setChannelUserMute === 'function') {
        this.mixer.setChannelUserMute(channel, channelState.muted);
      } else {
        this.synth.setChannelMute(channel, channelState.muted);
      }
    });

    if (this.mixer) {
      if (typeof this.mixer.applyAllChannelAudibility === 'function') {
        this.mixer.applyAllChannelAudibility();
      }
      if (typeof this.mixer.renderMixer === 'function') this.mixer.renderMixer();
    }
    if (this.fxRack && typeof this.fxRack.notifySelectionChange === 'function') {
      this.fxRack.notifySelectionChange();
    }
    if (options.updateActiveName !== false) this.activePresetName = state.name;
    this.syncSettingsUi(state);
    return { ok: true, state, missingTimbres };
  }

  applyRigState(input, options = {}) {
    let normalized;
    try {
      normalized = this.normalizeRigState(input, options.fallbackName || 'Snapshot do Rig');
    } catch (error) {
      return { ok: false, error };
    }
    if (options.requireTimbres) {
      const missingTimbres = Object.entries(normalized.channels)
        .filter(([, channelState]) => channelState.timbreInfo && this.resolveTimbreIndex(channelState) === null)
        .map(([channel, channelState]) => ({ channel: parseInt(channel, 10), ...channelState.timbreInfo }));
      if (missingTimbres.length > 0) {
        return {
          ok: false,
          missingTimbres,
          error: new Error(`${missingTimbres.length} timbre(s) necessário(s) não estão carregados.`)
        };
      }
    }
    const backup = options.rollback === false ? null : this.getCurrentState('Rollback');
    try {
      return this._applyNormalizedState(normalized, options);
    } catch (error) {
      if (backup) {
        try { this._applyNormalizedState(backup, { updateActiveName: false }); } catch (rollbackError) {}
      }
      return { ok: false, error };
    }
  }

  loadPreset(input) {
    const result = this.applyRigState(input, { updateActiveName: true });
    if (!result.ok) {
      this.notify('Erro ao Carregar Preset', result.error.message, 'warning');
      return false;
    }
    this.updatePresetDropdownUI();
    const select = document.getElementById('presetSelect');
    if (select) select.value = result.state.name;
    if (result.missingTimbres.length > 0) {
      this.notify('Timbres Ausentes', `${result.missingTimbres.length} timbre(s) não estão no banco SF2 carregado.`, 'warning');
    }
    return true;
  }

  syncSettingsUi(state) {
    const channelCount = document.getElementById('mixerChannelCountSelect');
    if (channelCount) channelCount.value = String(state.totalChannels);
    const polyphony = document.getElementById('modalPolyphonySelect');
    if (polyphony) polyphony.value = String(state.polyphony);
    const velocity = document.getElementById('modalVelocityCurveSelect');
    if (velocity) velocity.value = state.velocityCurve;
  }

  persistPreset(state) {
    const previous = this.userPresets.get(state.name);
    this.userPresets.set(state.name, state);
    if (!this.saveUserPresetsToStorage()) {
      if (previous) this.userPresets.set(state.name, previous);
      else this.userPresets.delete(state.name);
      return false;
    }
    this.activePresetName = state.name;
    this.updatePresetDropdownUI();
    const select = document.getElementById('presetSelect');
    if (select) select.value = state.name;
    return true;
  }

  createNewPreset(name) {
    const cleanName = this.cleanText(name, '', 120);
    if (!cleanName) return null;
    const state = this.getCurrentState(cleanName);
    if (!this.persistPreset(state)) {
      this.notify('Falha ao Salvar Preset', 'O armazenamento local não está disponível.', 'warning');
      return null;
    }
    this.notify('Preset Criado', `Preset "${cleanName}" salvo no aplicativo.`, 'success');
    return state;
  }

  saveActivePreset() {
    let name = this.activePresetName;
    const select = document.getElementById('presetSelect');
    if (!name && select && select.value) name = select.value;
    if (!name) {
      const modal = document.getElementById('newPresetNameModal');
      if (modal) modal.style.display = 'flex';
      return null;
    }
    const state = this.getCurrentState(name);
    if (!this.persistPreset(state)) {
      this.notify('Falha ao Salvar Preset', 'O armazenamento local não está disponível.', 'warning');
      return null;
    }
    this.notify('Preset Salvo', `Configuração "${name}" atualizada no aplicativo.`, 'success');
    return state;
  }

  savePreset(name) {
    return this.cleanText(name, '', 120) ? this.createNewPreset(name) : this.saveActivePreset();
  }

  importPresetText(content) {
    const parsed = JSON.parse(String(content));
    const normalized = this.normalizeRigState(parsed, 'Preset Importado');
    if (!this.persistPreset(normalized)) throw new Error('Não foi possível persistir o preset importado.');
    if (!this.loadPreset(normalized)) throw new Error('Não foi possível aplicar o preset importado.');
    this.notify('Preset Importado', `Preset "${normalized.name}" carregado com sucesso.`, 'success');
    return normalized;
  }

  async openPresetFileDialog() {
    if (window.electronAPI && typeof window.electronAPI.openPresetFile === 'function') {
      try {
        const result = await window.electronAPI.openPresetFile();
        if (!result) return null;
        return this.importPresetText(result.content);
      } catch (error) {
        this.notify('Erro ao Importar Preset', error.message, 'warning');
        return null;
      }
    }
    const fileInput = document.getElementById('presetFileInput');
    if (fileInput) fileInput.click();
    return null;
  }

  importPresetFromJsonFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try { this.importPresetText(event.target.result); }
      catch (error) { this.notify('Erro ao Importar Preset', error.message, 'warning'); }
    };
    reader.onerror = () => this.notify('Erro ao Importar Preset', 'Não foi possível ler o arquivo.', 'warning');
    reader.readAsText(file);
  }

  async exportPresetToJson(input) {
    let state;
    try { state = this.normalizeRigState(input, 'Preset'); }
    catch (error) {
      this.notify('Erro ao Exportar Preset', error.message, 'warning');
      return false;
    }
    const content = JSON.stringify(state, null, 2);
    const defaultPath = `${state.name.replace(/[^a-z0-9\s_-]/gi, '_').trim() || 'preset'}_preset.json`;
    if (window.electronAPI && typeof window.electronAPI.savePresetFile === 'function') {
      try {
        const saved = await window.electronAPI.savePresetFile(defaultPath, content);
        if (saved) this.notify('Preset Exportado', 'Arquivo JSON salvo com sucesso.', 'success');
        return !!saved;
      } catch (error) {
        this.notify('Erro ao Exportar Preset', error.message, 'warning');
        return false;
      }
    }
    try {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = defaultPath;
      anchor.click();
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      this.notify('Erro ao Exportar Preset', error.message, 'warning');
      return false;
    }
  }

  saveUserPresetsToStorage() {
    try {
      localStorage.setItem('sf2_user_presets', JSON.stringify(Array.from(this.userPresets.values())));
      return true;
    } catch (error) {
      console.error('[PresetManager] Falha ao persistir presets:', error);
      return false;
    }
  }

  loadUserPresetsFromStorage() {
    try {
      const raw = localStorage.getItem('sf2_user_presets');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Formato de armazenamento inválido.');
      parsed.forEach(candidate => {
        try {
          const normalized = this.normalizeRigState(candidate, 'Preset');
          this.userPresets.set(normalized.name, normalized);
        } catch (error) {
          console.warn('[PresetManager] Preset local inválido ignorado:', error);
        }
      });
    } catch (error) {
      console.error('[PresetManager] Falha ao carregar presets locais:', error);
    }
  }

  updatePresetDropdownUI() {
    const select = document.getElementById('presetSelect');
    if (!select) return;
    const current = this.activePresetName || select.value;
    select.replaceChildren();
    if (this.userPresets.size === 0) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.disabled = true;
      empty.selected = true;
      empty.textContent = '(nenhum preset salvo)';
      select.appendChild(empty);
      return;
    }
    this.userPresets.forEach(state => {
      const option = document.createElement('option');
      option.value = state.name;
      option.textContent = state.name;
      select.appendChild(option);
    });
    if (current && this.userPresets.has(current)) select.value = current;
  }

  notify(title, message, type) {
    if (window.showToastNotification) window.showToastNotification(title, message, type);
    else if (type === 'warning') console.warn(`[PresetManager] ${title}: ${message}`);
  }
}

window.PresetManager = PresetManager;
