# Requirements

## Functional Requirements

### 1. Engine de Sintetizador SF2 (SoundFont)
- **REQ-SF2-1**: O sistema deve ser capaz de carregar e decodificar arquivos binários `.sf2`.
- **REQ-SF2-2**: Deve permitir selecionar qualquer instrumento/preset dentro do banco SF2 carregado.
- **REQ-SF2-3**: Deve suportar reprodução polifônica de notas com envelopes de ADSR (Attack, Decay, Sustain, Release) em tempo real com baixa latência.
- **REQ-SF2-4**: Deve responder a comandos de velocidade de nota (*velocity*), Pitch Bend e Mod Wheel.

### 2. Conectividade com Teclado MIDI Físico (WebMIDI API)
- **REQ-MIDI-1**: Reconhecimento automático *Plug & Play* de teclados controladores MIDI USB (via cabo OTG no Android) e Bluetooth MIDI.
- **REQ-MIDI-2**: Roteamento de eventos MIDI de entrada (Note On, Note Off, Pitch Bend, CC1 Modulation, CC64 Sustain Pedal) para os canais do sintetizador.
- **REQ-MIDI-3**: Suporte a seleção de canal MIDI (Channel 1-16) para acionar timbres específicos ou criar *layers/splits*.

### 3. Console de Mixer Multitimbrico
- **REQ-MIX-1**: Suporte para até 16 canais/faixas MIDI configuráveis.
- **REQ-MIX-2**: Controle individual de Volume (Fader vertical) por canal.
- **REQ-MIX-3**: Controle de Panorama (PAN L/R) por canal.
- **REQ-MIX-4**: Botões Mute (silenciar) e Solo por canal.
- **REQ-MIX-5**: Indicador visual de pico de sinal de áudio (VU Meter estéreo animado).
- **REQ-MIX-6**: Controle de transposição de oitava individual por canal (+/- 2 oitavas).

### 4. Gerenciador de Presets (Preset System)
- **REQ-PRESET-1**: Botão "Salvar Preset" para capturar o estado atual da Workstation (instrumentos por canal, faders, knobs, efeitos).
- **REQ-PRESET-2**: Lista de presets salvos para seleção e carregamento rápido com 1 clique (ideal para troca de som em shows).
- **REQ-PRESET-3**: Funcionalidade de Exportar/Importar arquivos de preset `.json`.
- **REQ-PRESET-4**: Atalhos de teclado no Electron (`Ctrl+S` para salvar, `Ctrl+O` para abrir arquivos).

### 5. Rack de Efeitos (FX Rack)
- **REQ-FX-1**: Reverb Estéreo com controle de tamanho de sala (*Room Size*) e nível *Wet/Dry*.
- **REQ-FX-2**: Delay Stereo com controle de tempo e feedback.
- **REQ-FX-3**: Equalizador Paramétrico de 3 Bandas (Low, Mid, High).
- **REQ-FX-4**: Master Limiter para impedir distorção nos alto-falantes.

### 6. Distribuição Cross-Platform & Google Play Store
- **REQ-PLAT-1**: Suporte para empacotamento e distribuição na **Google Play Store** via **Trusted Web Activity (TWA / Bubblewrap)** a partir do `manifest.json`.
- **REQ-PLAT-2**: Suporte para empacotamento Desktop com **Electron.js** (Windows/Mac).

## User Stories

- As a keyboardist, I want to download the app directly from the Google Play Store, connect my USB MIDI keyboard to my Android phone, load my SF2 soundfonts, and play live with zero latency.
- As a performer, I want to adjust volume faders, panning, and reverb for each layer and save my custom setup into a preset named "Show - Ballad Piano" for instant recall on stage.
- As a user without a physical controller, I want a multi-touch screen keyboard to test sounds and play notes directly on my phone.

## Definition of Done

- App bundle (.aab / manifest) is ready for Google Play Store upload.
- Connecting a USB/Bluetooth MIDI keyboard triggers notes and soundfont voices seamlessly.
- Preset Manager saves and reloads all layers, faders, knobs, and FX settings correctly.
- Application builds and runs in Electron (Desktop) and Chrome/Android.
