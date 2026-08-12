# Phase 3 Plan: WebMIDI USB/Bluetooth Keyboard Engine, Touch Keyboard & Preset Management

**Phase Goal**: Implementar a integração completa com teclados controladores MIDI físicos via **WebMIDI API** (USB-OTG e Bluetooth), o teclado virtual multi-touch aprimorado e o **Gerenciador de Presets Completo (Salvar / Carregar / Exportar JSON / Atalho Ctrl+S)**.

---

## Task 1: WebMIDI API Manager (USB-OTG & Bluetooth MIDI Plug-and-Play)
- **Goal**: Detectar automaticamente teclados controladores MIDI conectados por cabo USB ou Bluetooth, escutar eventos `midimessage` (NoteOn, NoteOff, PitchBend, CC1 ModWheel, CC64 Sustain Pedal) e repassar em tempo real para o `SynthEngine`.
- **Files**:
  - `js/web-midi.js`

## Task 2: Gerenciador de Presets (Salvar, Carregar, Importar/Exportar JSON & Atalho Ctrl+S)
- **Goal**: Construir o sistema de salvamento de estado completo da rig (Mixer, FX Rack, Timbres, Polifonia) com persistência local e exportação/importação de arquivos `.json`.
- **Files**:
  - `js/preset-manager.js`

## Task 3: Integração com UI, Indicador de Controlador e Teclado Touch
- **Goal**: Atualizar o aplicativo para exibir o nome do teclado controlador conectado, conectar os botões de Salvar/Carregar Preset da toolbar e aprimorar o teclado touch no mobile.
- **Files**:
  - `index.html`
  - `js/app.js`

---

## Verification Criteria
- [ ] Conectar ou desconectar um controlador MIDI USB dispara reconhecimento instantâneo e atualiza o indicador no cabeçalho.
- [ ] Tocar no teclado controlador MIDI físico aciona as vozes polifônicas com baixíssima latência e responde aos pedais de Sustain (CC64) e Pitch Bend.
- [ ] O botão "Salvar Preset" captura volumes, panning, efeitos e timbres, salvando no navegador/Electron com atalho `Ctrl+S`.
- [ ] O botão "Carregar Preset" e a lista de fábrica alternam perfeitamente entre presets salvos.
