/**
 * WEBMIDI API INPUT MANAGER (OTIMIZADO COM GSD-WEBMIDI-CONTROLLER)
 * Reconhecimento automático Plug-and-Play de Teclados Controladores MIDI USB (cabo OTG no Android) e Bluetooth MIDI.
 */

class WebMidiManager {
  constructor(synthEngine) {
    this.synth = synthEngine;
    this.midiAccess = null;
    this.connectedInputs = new Map(); // id -> MIDIInput
    this.activeDeviceName = 'Nenhum';
    this.onDeviceStatusChangeCallback = null;

    // Estado do Pedal de Sustain (CC64)
    this.sustainPedalActive = false;
    this.sustainedNotes = new Set(); // Notas mantidas pelo pedal
  }

  init(statusCallback) {
    this.onDeviceStatusChangeCallback = statusCallback;

    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess({ sysex: true })
        .then((midiAccess) => {
          this.midiAccess = midiAccess;
          console.log('[WebMIDI] Acesso à API WebMIDI concedido com sucesso!');

          this.updateMidiInputs();

          this.midiAccess.onstatechange = (e) => {
            console.log(`[WebMIDI] Estado do dispositivo alterado: ${e.port.name} (${e.port.state})`);
            this.updateMidiInputs();
          };
        })
        .catch((err) => {
          console.warn('[WebMIDI] Não foi possível acessar a API WebMIDI:', err.message);
          if (this.onDeviceStatusChangeCallback) {
            this.onDeviceStatusChangeCallback('Não Suportado');
          }
        });
    } else {
      console.warn('[WebMIDI] WebMIDI API não é suportada neste navegador.');
      if (this.onDeviceStatusChangeCallback) {
        this.onDeviceStatusChangeCallback('Não Suportado');
      }
    }
  }

  updateMidiInputs() {
    if (!this.midiAccess) return;

    this.connectedInputs.clear();
    const inputs = this.midiAccess.inputs.values();
    let deviceNames = [];

    for (let input of inputs) {
      this.connectedInputs.set(input.id, input);
      deviceNames.push(input.name);

      input.onmidimessage = (e) => this.handleMidiMessage(e);
    }

    if (deviceNames.length > 0) {
      this.activeDeviceName = deviceNames.join(', ');
    } else {
      this.activeDeviceName = 'Nenhum';
    }

    console.log(`[WebMIDI] Dispositivos conectados: ${this.activeDeviceName}`);
    if (this.onDeviceStatusChangeCallback) {
      this.onDeviceStatusChangeCallback(this.activeDeviceName);
    }
  }

  handleMidiMessage(event) {
    const data = event.data;
    if (!data || data.length < 2) return;

    const command = data[0] & 0xF0;
    const channel = (data[0] & 0x0F) + 1; // Canal MIDI 1 a 16
    const note = data[1];
    const velocity = data.length > 2 ? data[2] : 0;

    switch (command) {
      case 0x90: // Note On
        if (velocity > 0) {
          this.synth.noteOn(note, velocity, channel);
          if (this.sustainPedalActive) {
            this.sustainedNotes.add(`${channel}_${note}`);
          }
        } else {
          this.handleNoteOffEvent(note, channel);
        }
        break;

      case 0x80: // Note Off
        this.handleNoteOffEvent(note, channel);
        break;

      case 0xE0: // Pitch Bend (Roda de Afinação)
        const bendRaw = (data[2] << 7) | data[1];
        const bendNormalized = (bendRaw - 8192) / 8192.0; // -1.0 a +1.0
        const bendSemitones = bendNormalized * 2.0; // +/- 2 semitones por padrão
        this.synth.setPitchBend(channel, bendSemitones);
        break;

      case 0xB0: // Control Change (CC)
        const ccNumber = data[1];
        const ccValue = data[2];

        if (ccNumber === 64) { // Pedal de Sustain (Damper)
          this.sustainPedalActive = ccValue >= 64;
          if (!this.sustainPedalActive) {
            this.sustainedNotes.forEach((key) => {
              const [ch, n] = key.split('_').map(Number);
              this.synth.noteOff(n, ch);
            });
            this.sustainedNotes.clear();
          }
        } else if (ccNumber === 1) { // Modulation Wheel
          console.log(`[WebMIDI] Mod Wheel (CC1): ${ccValue}`);
        } else if (ccNumber === 7) { // Canal Volume
          const volNorm = ccValue / 127.0;
          this.synth.setChannelVolume(channel, volNorm);
        }
        break;

      case 0xC0: // Program Change
        const programNum = data[1];
        console.log(`[WebMIDI] Program Change: ${programNum} no Canal ${channel}`);
        break;
    }
  }

  handleNoteOffEvent(note, channel) {
    const key = `${channel}_${note}`;
    if (this.sustainPedalActive) {
      this.sustainedNotes.add(key);
    } else {
      this.synth.noteOff(note, channel);
    }
  }
}

window.WebMidiManager = WebMidiManager;
