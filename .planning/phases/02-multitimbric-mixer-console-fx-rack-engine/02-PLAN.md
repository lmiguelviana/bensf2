# Phase 2 Plan: Multitimbric Mixer Console & FX Rack Engine

**Phase Goal**: Desenvolver o console de mixagem multitimbrico completo de 16 canais (Faders de Volume, Panorama, Mute, Solo, Transposição e VU Meters de pico estéreo em tempo real) e o Rack de Processamento de Efeitos (Reverb Estéreo, Delay, EQ 3-Bandas e Master Limiter).

---

## Task 1: Roteamento Multitimbrico do Mixer (16 Canais & Layers)
- **Goal**: Implementar a lógica de canais do mixer para controlar até 16 pistas MIDI individuais com faders de volume, knobs de pan, mute, solo e transposição de oitava.
- **Files**:
  - `js/mixer.js`
  - `css/mixer.css`

## Task 2: VU Meters Estéreo Animados em Tempo Real (AnalyserNode)
- **Goal**: Desenvolver medidores visuais de pico de sinal de áudio estéreo usando Web Audio `AnalyserNode` e renderização de alta performance.
- **Files**:
  - `js/vu-meter.js`

## Task 3: Rack de Processadores de Efeitos (Reverb, Delay & EQ 3-Bandas)
- **Goal**: Construir os nós DSP de efeitos áudio para Reverb Convolver, Delay Estéreo e Equalizador de 3 Bandas acoplados ao Master Limiter.
- **Files**:
  - `js/fx-rack.js`
  - `css/synth-rack.css`

## Task 4: Integração dos Controles do Mixer & FX com a Interface UI
- **Goal**: Ligar todos os elementos da interface do usuário (`index.html`) aos processadores de áudio no `js/app.js`.
- **Files**:
  - `index.html`
  - `js/app.js`

---

## Verification Criteria
- [ ] O console de mixer suporta alterar volume, panning, mute e solo de canais individualmente sem engasgos de áudio.
- [ ] VU Meters exibem níveis de pico estéreo em tempo real conforme notas são tocadas.
- [ ] Alterações nos knobs de Reverb (Room Size/Wet-Dry), Delay e EQ afetam o sinal de saída de forma audível e suave.
- [ ] O Master Limiter previne qualquer distorção (*clipping*) quando múltiplos canais tocam juntos.
