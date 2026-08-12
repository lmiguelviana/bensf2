# Requirements

## Functional Requirements

### 1. Engine de Sintetizador SF2 (SoundFont)
- **REQ-SF2-1**: O sistema deve ser capaz de carregar e decodificar arquivos binários `.sf2`.
- **REQ-SF2-2**: Deve permitir selecionar qualquer instrumento/preset dentro do banco SF2 carregado.
- **REQ-SF2-3**: Deve suportar reprodução polifônica de notas com envelopes de ADSR (Attack, Decay, Sustain, Release).
- **REQ-SF2-4**: Deve responder a comandos de velocidade de nota e Pitch Bend.

### 2. Console de Mixer Multitimbrico
- **REQ-MIX-1**: Suporte para até 16 canais/faixas MIDI configuráveis.
- **REQ-MIX-2**: Controle individual de Volume (Fader vertical) por canal.
- **REQ-MIX-3**: Controle de Panorama (PAN L/R) por canal.
- **REQ-MIX-4**: Botões Mute (silenciar) e Solo por canal.
- **REQ-MIX-5**: Indicador visual de pico de sinal de áudio (VU Meter estéreo animado).
- **REQ-MIX-6**: Controle de transposição de oitava individual por canal (+/- 2 oitavas).

### 3. Gerenciador de Presets (Preset System)
- **REQ-PRESET-1**: Botão "Salvar Preset" para capturar o estado atual da Workstation (instrumentos por canal, faders, knobs, efeitos).
- **REQ-PRESET-2**: Lista de presets salvos para seleção e carregamento com 1 clique.
- **REQ-PRESET-3**: Funcionalidade de Exportar/Importar arquivos de preset `.json`.
- **REQ-PRESET-4**: Atalhos de teclado no Electron (`Ctrl+S` para salvar, `Ctrl+O` para abrir arquivos).

### 4. Player MIDI & Teclado Virtual
- **REQ-MIDI-1**: Leitor e reprodutor de arquivos `.mid` com suporte a múltiplos canais.
- **REQ-MIDI-2**: Barra de transporte (Play, Pause, Stop, Seekbar e regulador de BPM/Tempo).
- **REQ-MIDI-3**: Teclado virtual multi-touch adaptável para dispositivos móveis e acionável por teclado QWERTY no computador.
- **REQ-MIDI-4**: Suporte a controladores MIDI externos via WebMIDI API (USB-OTG e Bluetooth).

### 5. Rack de Efeitos (FX Rack)
- **REQ-FX-1**: Reverb Estéreo com controle de tamanho de sala (*Room Size*) e nível *Wet/Dry*.
- **REQ-FX-2**: Delay Stereo sincronizável com o BPM.
- **REQ-FX-3**: Equalizador Paramétrico de 3 Bandas (Low, Mid, High).
- **REQ-FX-4**: Master Limiter para impedir clipping de áudio.

### 6. Execução Cross-Platform
- **REQ-PLAT-1**: Suporte para empacotamento Desktop com **Electron.js** (Windows/Mac).
- **REQ-PLAT-2**: Suporte para execução como **PWA** (Progressive Web App) no Android.

## User Stories

- As a keyboardist, I want to load an SF2 soundfont, adjust volume and reverb, and save it as a preset so I can quickly load my favorite setup during a live show.
- As a producer, I want to load a MIDI file, assign custom SF2 soundfont instruments to each channel, and listen to the song with real-time VU meters.
- As a desktop user, I want to run the application natively via Electron with keyboard shortcuts.
- As a mobile user, I want a responsive touch keyboard and touch-friendly faders on my Android screen.

## Definition of Done

- Code builds cleanly without errors.
- Both SF2 loading, MIDI playback, mixing controls, FX rack, and Preset saving work smoothly.
- Application launches in Electron desktop environment and mobile browser viewport.
