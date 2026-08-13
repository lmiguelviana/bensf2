/**
 * WEBMIDI CONTROLLER MANAGER (MULTI-DEVICE, MIDI LEARN & KEY RANGE LEARNING)
 * Suporte a múltiplos teclados controladores MIDI (USB-OTG e Bluetooth), automação MIDI CC Learn e Aprendizado de Notas de Split em tempo real.
 */

class WebMidiManager {
  constructor(synthEngine) {
    this.synth = synthEngine;
    this.midiAccess = null;
    this.activeInputs = new Map();
    this.deviceChannelMap = new Map();
    this.deviceActiveMap = new Map(); // deviceId -> boolean (ativo ou inativo)
    this.activeNoteRoutes = new Map(); // tecla fisica -> canal resolvido no Note On
    this.noteInstanceSequence = 0;
    this.sustainBySource = new Map(); // sourceId -> pedal state
    this.sustainedNoteRoutes = new Map(); // ownerId -> deferred note-off route
    this.onStatusChange = null;

    this.ccCustomMappings = new Map(); // ccNum -> callback(normVal)
    this.learningCallback = null;
    this.noteLearningCallback = null;

    this.loadDevicePreferences();
  }

  loadDevicePreferences() {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = JSON.parse(localStorage.getItem('bensf2_midi_device_preferences') || '{}');
      Object.entries(stored.channels || {}).forEach(([deviceId, channel]) => {
        this.deviceChannelMap.set(deviceId, channel === 'all' ? 'all' : parseInt(channel, 10));
      });
      Object.entries(stored.active || {}).forEach(([deviceId, active]) => {
        this.deviceActiveMap.set(deviceId, active !== false);
      });
    } catch (e) {
      console.warn('[WebMIDI] Preferencias MIDI salvas estavam invalidas e foram ignoradas.');
    }
  }

  saveDevicePreferences() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('bensf2_midi_device_preferences', JSON.stringify({
        channels: Object.fromEntries(this.deviceChannelMap),
        active: Object.fromEntries(this.deviceActiveMap)
      }));
    } catch (e) {}
  }

  init(statusCallback) {
    this.onStatusChange = statusCallback;

    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess({ sysex: false })
        .then((access) => this.handleMidiSuccess(access))
        .catch((err) => {
          console.warn('[WebMIDI] Acesso MIDI recusado ou indisponível:', err);
          if (this.onStatusChange) this.onStatusChange('Não Suportado');
        });
    } else {
      console.warn('[WebMIDI] WebMIDI API não suportada neste navegador.');
      if (this.onStatusChange) this.onStatusChange('Não Suportado');
    }
  }

  handleMidiSuccess(access) {
    this.midiAccess = access;
    this.updateDeviceList();

    this.midiAccess.onstatechange = (e) => {
      console.log(`[WebMIDI] Mudança de estado do dispositivo: ${e.port.name} (${e.port.state})`);
      this.updateDeviceList();
    };
  }

  updateDeviceList() {
    if (!this.midiAccess) return;

    const previouslyConnectedIds = new Set(this.activeInputs.keys());
    this.activeInputs.clear();
    const inputs = Array.from(this.midiAccess.inputs.values());
    const connectedNames = [];

    inputs.forEach((input) => {
      if (input.state === 'connected') {
        this.activeInputs.set(input.id, input);
        connectedNames.push(input.name);

        if (!this.deviceChannelMap.has(input.id)) {
          // Por padrao, respeitar o canal que vem no proprio status MIDI.
          this.deviceChannelMap.set(input.id, 'all');
        }

        const isActive = !this.deviceActiveMap.has(input.id) || this.deviceActiveMap.get(input.id);
        input.onmidimessage = isActive
          ? (e) => this.handleMidiMessage(e, input.id)
          : null;
      }
    });

    previouslyConnectedIds.forEach((deviceId) => {
      if (!this.activeInputs.has(deviceId)) this.releaseDeviceNotes(deviceId);
    });

    this.saveDevicePreferences();

    if (this.onStatusChange) {
      if (connectedNames.length === 0) {
        this.onStatusChange('Nenhum');
      } else if (connectedNames.length === 1) {
        this.onStatusChange(connectedNames[0]);
      } else {
        this.onStatusChange(`${connectedNames.length} Dispositivos`);
      }
    }
  }

  getConnectedDevicesList() {
    if (!this.midiAccess) return [];
    const inputs = Array.from(this.midiAccess.inputs.values())
      .filter((input) => input.state === 'connected');
    return inputs.map((input) => ({
      id: input.id,
      name: input.name || `Controlador MIDI (${input.id})`,
      manufacturer: input.manufacturer || 'Genérico',
      assignedChannel: this.deviceChannelMap.get(input.id) || 'all',
      active: this.deviceActiveMap.has(input.id) ? this.deviceActiveMap.get(input.id) : true
    }));
  }

  setDeviceChannelMapping(deviceId, channel) {
    const parsedChannel = channel === 'all' ? 'all' : parseInt(channel, 10);
    if (parsedChannel !== 'all' && (!Number.isFinite(parsedChannel) || parsedChannel < 1 || parsedChannel > 16)) {
      return;
    }
    this.deviceChannelMap.set(deviceId, parsedChannel);
    this.saveDevicePreferences();
    console.log(`[WebMIDI] Dispositivo ${deviceId} remapeado para o Canal MIDI: ${parsedChannel}`);
  }

  setDeviceActive(deviceId, isActive) {
    if (!isActive) this.releaseDeviceNotes(deviceId);
    this.deviceActiveMap.set(deviceId, isActive);
    // Atualizar o handler de mensagem: se inativo, remove o onmidimessage
    const input = this.activeInputs.get(deviceId);
    if (input) {
      if (isActive) {
        input.onmidimessage = (e) => this.handleMidiMessage(e, deviceId);
      } else {
        input.onmidimessage = null; // silenciar completamente
      }
    }
    this.saveDevicePreferences();
    console.log(`[WebMIDI] Dispositivo ${deviceId} definido como: ${isActive ? 'ATIVO' : 'INATIVO'}`);
  }

  setLearningCallback(callback) {
    this.learningCallback = callback;
  }

  setNoteLearningCallback(callback) {
    this.noteLearningCallback = callback;
  }

  cancelLearning() {
    this.learningCallback = null;
    this.noteLearningCallback = null;
  }

  addCcMapping(ccNum, callback, scope = null) {
    if (!scope || (scope.deviceId === undefined && scope.channel === undefined)) {
      this.ccCustomMappings.set(ccNum, callback);
      return;
    }
    this.ccCustomMappings.set(this.getCcMappingKey(ccNum, scope), callback);
  }

  removeCcMapping(ccNum, scope = null) {
    if (!scope || (scope.deviceId === undefined && scope.channel === undefined)) {
      this.ccCustomMappings.delete(ccNum);
      return;
    }
    this.ccCustomMappings.delete(this.getCcMappingKey(ccNum, scope));
  }

  getCcMappingKey(ccNum, scope = {}) {
    const device = scope.deviceId === undefined ? '*' : String(scope.deviceId);
    const channel = scope.channel === undefined || scope.channel === 'all'
      ? '*'
      : String(parseInt(scope.channel, 10));
    return JSON.stringify(['cc', device, channel, parseInt(ccNum, 10)]);
  }

  dispatchCcMappings(ccNum, normalizedValue, deviceId, rawChannel) {
    const invoked = new Set();
    const invoke = (key) => {
      const callback = this.ccCustomMappings.get(key);
      if (typeof callback !== 'function' || invoked.has(callback)) return;
      invoked.add(callback);
      callback(normalizedValue, { deviceId, channel: rawChannel, cc: ccNum });
    };
    invoke(ccNum); // Backwards-compatible unscoped MIDI Learn binding.
    invoke(this.getCcMappingKey(ccNum, { deviceId, channel: rawChannel }));
    invoke(this.getCcMappingKey(ccNum, { deviceId }));
    invoke(this.getCcMappingKey(ccNum, { channel: rawChannel }));
  }

  getActiveNoteRouteKey(deviceId, rawChannel, note) {
    return JSON.stringify([String(deviceId), rawChannel, note]);
  }

  getMidiSourceId(deviceId, rawChannel) {
    // Stable across track remapping: physical source identity is the device and
    // channel encoded by the controller, not the current destination track.
    return JSON.stringify([String(deviceId), rawChannel]);
  }

  makeNoteOwnerId(sourceId, note) {
    this.noteInstanceSequence += 1;
    return `${sourceId}:note:${note}:instance:${this.noteInstanceSequence}`;
  }

  releaseNoteRoute(route) {
    if (!route || !this.synth || typeof this.synth.noteOff !== 'function') return;
    this.synth.noteOff(route.note, route.targetChannel, null, {
      ownerId: route.ownerId,
      sourceId: route.sourceId
    });
  }

  releaseSustainedSource(sourceId) {
    this.sustainedNoteRoutes.forEach((route, ownerId) => {
      if (route.sourceId !== sourceId) return;
      this.releaseNoteRoute(route);
      this.sustainedNoteRoutes.delete(ownerId);
    });
  }

  handleNoteOffRoute(route) {
    if (!route) return;
    if (this.sustainBySource.get(route.sourceId)) {
      this.sustainedNoteRoutes.set(route.ownerId, route);
    } else {
      this.releaseNoteRoute(route);
    }
  }

  releaseDeviceNotes(deviceId) {
    this.activeNoteRoutes.forEach((route, key) => {
      if (route.deviceId !== deviceId) return;
      this.releaseNoteRoute(route);
      this.activeNoteRoutes.delete(key);
    });
    this.sustainedNoteRoutes.forEach((route, ownerId) => {
      if (route.deviceId !== deviceId) return;
      this.releaseNoteRoute(route);
      this.sustainedNoteRoutes.delete(ownerId);
    });
    Array.from(this.sustainBySource.keys()).forEach((sourceId) => {
      try {
        const parsed = JSON.parse(sourceId);
        if (parsed[0] === String(deviceId)) this.sustainBySource.delete(sourceId);
      } catch (e) {}
    });
  }

  handleMidiMessage(event, deviceId) {
    if (this.deviceActiveMap.get(deviceId) === false) return;
    const data = event.data;
    if (!data || data.length < 2) return;

    const command = data[0] & 0xf0;
    const rawChannel = (data[0] & 0x0f) + 1;
    const noteOrCc = data[1];
    const velocityOrVal = data[2] !== undefined ? data[2] : 0;

    const mappedChannelSetting = this.deviceChannelMap.get(deviceId);
    const targetChannel = (mappedChannelSetting && mappedChannelSetting !== 'all') ? parseInt(mappedChannelSetting, 10) : rawChannel;
    const noteRouteKey = this.getActiveNoteRouteKey(deviceId, rawChannel, noteOrCc);
    const sourceId = this.getMidiSourceId(deviceId, rawChannel);

    switch (command) {
      case 0x90: // Note On
        if (velocityOrVal > 0) {
          // Se houver um manipulador de aprendizado de Nota de Split (Key Zone Learn), acionar!
          if (this.noteLearningCallback) {
            const cb = this.noteLearningCallback;
            this.noteLearningCallback = null;
            cb(noteOrCc);
            return;
          }

          const previousRoute = this.activeNoteRoutes.get(noteRouteKey);
          if (previousRoute) this.handleNoteOffRoute(previousRoute);
          const route = {
            deviceId,
            note: noteOrCc,
            targetChannel,
            sourceId,
            ownerId: this.makeNoteOwnerId(sourceId, noteOrCc)
          };
          this.activeNoteRoutes.set(noteRouteKey, route);
          this.synth.noteOn(noteOrCc, velocityOrVal, targetChannel, null, {
            ownerId: route.ownerId,
            sourceId: route.sourceId
          });
        } else {
          const route = this.activeNoteRoutes.get(noteRouteKey);
          this.activeNoteRoutes.delete(noteRouteKey);
          if (route) this.handleNoteOffRoute(route);
        }
        break;

      case 0x80: // Note Off
        {
          const route = this.activeNoteRoutes.get(noteRouteKey);
          this.activeNoteRoutes.delete(noteRouteKey);
          if (route) this.handleNoteOffRoute(route);
        }
        break;

      case 0xb0: // Control Change (CC)
        // Se estiver em modo de aprendizado (MIDI Learn), capturar o número do CC!
        if (this.learningCallback) {
          const cb = this.learningCallback;
          this.learningCallback = null;
          cb(noteOrCc);
          return;
        }

        // Executar mapa customizado de MIDI Learn se existir para este CC
        this.dispatchCcMappings(noteOrCc, velocityOrVal / 127.0, deviceId, rawChannel);

        if (noteOrCc === 64) { // CC64 - Pedal de Sustain
          const wasActive = this.sustainBySource.get(sourceId) === true;
          const isActive = velocityOrVal >= 64;
          this.sustainBySource.set(sourceId, isActive);
          if (wasActive && !isActive) this.releaseSustainedSource(sourceId);
        } else if (noteOrCc === 1) { // CC1 - Modulation wheel
          if (typeof this.synth.setMidiModulation === 'function') {
            this.synth.setMidiModulation(targetChannel, velocityOrVal / 127.0, sourceId);
          }
        } else if (noteOrCc === 7) { // CC7 - Master Volume
          const volNorm = velocityOrVal / 127.0;
          if (typeof this.synth.setMidiChannelVolume === 'function') {
            this.synth.setMidiChannelVolume(targetChannel, volNorm);
          } else {
            this.synth.setChannelVolume(targetChannel, volNorm);
          }
        }
        break;

      case 0xe0: // Pitch Bend
        const rawBend = (velocityOrVal << 7) | noteOrCc;
        const normalizedBend = (rawBend - 8192) / 8192.0;
        const semitones = normalizedBend * 2.0;
        if (typeof this.synth.setMidiPitchBend === 'function') {
          this.synth.setMidiPitchBend(targetChannel, semitones, sourceId);
        } else {
          this.synth.setPitchBend(targetChannel, semitones);
        }
        break;
    }
  }
}

window.WebMidiManager = WebMidiManager;
