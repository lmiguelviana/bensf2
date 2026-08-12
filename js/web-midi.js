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
    this.onStatusChange = null;
    this.sustainPedalActive = false;

    this.ccCustomMappings = new Map(); // ccNum -> callback(normVal)
    this.learningCallback = null;
    this.noteLearningCallback = null;
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

    this.activeInputs.clear();
    const inputs = Array.from(this.midiAccess.inputs.values());
    const connectedNames = [];

    inputs.forEach((input) => {
      if (input.state === 'connected') {
        this.activeInputs.set(input.id, input);
        input.onmidimessage = (e) => this.handleMidiMessage(e, input.id);
        connectedNames.push(input.name);

        if (!this.deviceChannelMap.has(input.id)) {
          const defaultChan = this.activeInputs.size;
          this.deviceChannelMap.set(input.id, defaultChan <= 16 ? defaultChan : 'all');
        }
      }
    });

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
    const inputs = Array.from(this.midiAccess.inputs.values());
    return inputs.map((input) => ({
      id: input.id,
      name: input.name || `Controlador MIDI (${input.id})`,
      manufacturer: input.manufacturer || 'Genérico',
      assignedChannel: this.deviceChannelMap.get(input.id) || 'all',
      active: this.deviceActiveMap.has(input.id) ? this.deviceActiveMap.get(input.id) : true
    }));
  }

  setDeviceChannelMapping(deviceId, channel) {
    this.deviceChannelMap.set(deviceId, channel);
    console.log(`[WebMIDI] Dispositivo ${deviceId} remapeado para o Canal MIDI: ${channel}`);
  }

  setDeviceActive(deviceId, isActive) {
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

  addCcMapping(ccNum, callback) {
    this.ccCustomMappings.set(ccNum, callback);
  }

  removeCcMapping(ccNum) {
    this.ccCustomMappings.delete(ccNum);
  }

  handleMidiMessage(event, deviceId) {
    const data = event.data;
    if (!data || data.length < 2) return;

    const command = data[0] & 0xf0;
    const rawChannel = (data[0] & 0x0f) + 1;
    const noteOrCc = data[1];
    const velocityOrVal = data[2] !== undefined ? data[2] : 0;

    const mappedChannelSetting = this.deviceChannelMap.get(deviceId);
    const targetChannel = (mappedChannelSetting && mappedChannelSetting !== 'all') ? parseInt(mappedChannelSetting, 10) : rawChannel;

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

          this.synth.noteOn(noteOrCc, velocityOrVal, targetChannel);
        } else {
          this.synth.noteOff(noteOrCc, targetChannel);
        }
        break;

      case 0x80: // Note Off
        this.synth.noteOff(noteOrCc, targetChannel);
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
        if (this.ccCustomMappings.has(noteOrCc)) {
          const customCb = this.ccCustomMappings.get(noteOrCc);
          customCb(velocityOrVal / 127.0);
        }

        if (noteOrCc === 64) { // CC64 - Pedal de Sustain
          this.sustainPedalActive = velocityOrVal >= 64;
        } else if (noteOrCc === 7) { // CC7 - Master Volume
          const volNorm = velocityOrVal / 127.0;
          this.synth.setChannelVolume(targetChannel, volNorm);
        }
        break;

      case 0xe0: // Pitch Bend
        const rawBend = (velocityOrVal << 7) | noteOrCc;
        const normalizedBend = (rawBend - 8192) / 8192.0;
        const semitones = normalizedBend * 2.0;
        this.synth.setPitchBend(targetChannel, semitones);
        break;
    }
  }
}

window.WebMidiManager = WebMidiManager;
