/**
 * WEBMIDI CONTROLLER MANAGER (MULTI-DEVICE SUPPORT)
 * Suporte a múltiplos teclados controladores MIDI (USB-OTG e Bluetooth) com roteamento individual por dispositivo.
 */

class WebMidiManager {
  constructor(synthEngine) {
    this.synth = synthEngine;
    this.midiAccess = null;
    this.activeInputs = new Map(); // id -> input
    this.deviceChannelMap = new Map(); // id -> assignedMidiChannel (1-16 ou 'all')
    this.onStatusChange = null;
    this.sustainPedalActive = false;
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
          // Atribuir canal padrão baseado na ordem dos dispositivos conectados
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
      assignedChannel: this.deviceChannelMap.get(input.id) || 'all'
    }));
  }

  setDeviceChannelMapping(deviceId, channel) {
    this.deviceChannelMap.set(deviceId, channel);
    console.log(`[WebMIDI] Dispositivo ${deviceId} remapeado para o Canal MIDI: ${channel}`);
  }

  handleMidiMessage(event, deviceId) {
    const data = event.data;
    if (!data || data.length < 2) return;

    const command = data[0] & 0xf0;
    const rawChannel = (data[0] & 0x0f) + 1;
    const noteOrCc = data[1];
    const velocityOrVal = data[2] !== undefined ? data[2] : 0;

    // Se o dispositivo tiver um canal fixo atribuído na configuração, usar ele!
    const mappedChannelSetting = this.deviceChannelMap.get(deviceId);
    const targetChannel = (mappedChannelSetting && mappedChannelSetting !== 'all') ? parseInt(mappedChannelSetting, 10) : rawChannel;

    switch (command) {
      case 0x90: // Note On
        if (velocityOrVal > 0) {
          this.synth.noteOn(noteOrCc, velocityOrVal, targetChannel);
        } else {
          this.synth.noteOff(noteOrCc, targetChannel);
        }
        break;

      case 0x80: // Note Off
        this.synth.noteOff(noteOrCc, targetChannel);
        break;

      case 0xb0: // Control Change (CC)
        if (noteOrCc === 64) { // CC64 - Pedal de Sustain
          this.sustainPedalActive = velocityOrVal >= 64;
        } else if (noteOrCc === 7) { // CC7 - Master Volume
          const volNorm = velocityOrVal / 127.0;
          this.synth.setChannelVolume(targetChannel, volNorm);
        }
        break;

      case 0xe0: // Pitch Bend
        const rawBend = (velocityOrVal << 7) | noteOrCc;
        const normalizedBend = (rawBend - 8192) / 8192.0; // [-1.0 a +1.0]
        const semitones = normalizedBend * 2.0; // +/- 2 semitons
        this.synth.setPitchBend(targetChannel, semitones);
        break;
    }
  }
}

window.WebMidiManager = WebMidiManager;
