/**
 * WEBMIDI API INPUT MANAGER
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

          // Mapear dispositivos já conectados
          this.updateMidiInputs();

          // Escutar evento de conexão/desconexão de dispositivos em tempo real
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

      // Vincular handler de mensagens MIDI
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
          // Se o pedal de sustain estiver pressionado, rastrear a nota
          if (this.sustainPedalActive) {
            this.sustainedNotes.add(`${channel}_${note}`);
          }
        } else {
          // Velocity = 0 equivale a Note Off
          this.handleNoteOffEvent(note, channel);
        }
        break;

      case 0x80: // Note Off
        this.handleNoteOffEvent(note, channel);
        break;

      case 0xE0: // Pitch Bend
        // Converter valor 14-bit (0 a 16383, centro em 8192)
        const bendRaw = (data[2] << 7) | data[1];
        const bendNormalized = (bendRaw - 8192) / 8192.0; // -1.0 a +1.0
        console.log(`[WebMIDI] Pitch Bend: ${bendNormalized.toFixed(2)} no Canal ${channel}`);
        break;

      case 0xB0: // Control Change (CC)
        const ccNumber = data[1];
        const ccValue = data[2];

        if (ccNumber === 64) { // Pedal de Sustain (Damper)
          this.sustainPedalActive = ccValue >= 64;
          console.log(`[WebMIDI] Pedal de Sustain: ${this.sustainPedalActive ? 'Pressionado' : 'Solto'}`);

          if (!this.sustainPedalActive) {
            // Ao soltar o pedal, desligar as notas que estavam sustentadas
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

      case 0xC0: // Program Change (Troca de Timbre)
        const programNum = data[1];
        console.log(`[WebMIDI] Program Change: ${programNum} no Canal ${channel}`);
        break;
    }
  }

  handleNoteOffEvent(note, channel) {
    const key = `${channel}_${note}`;
    if (this.sustainPedalActive) {
      // Manter a nota soando enquanto o pedal de sustain estiver pressionado
      this.sustainedNotes.add(key);
    } else {
      this.synth.noteOff(note, channel);
    }
  }
}

window.WebMidiManager = WebMidiManager;
