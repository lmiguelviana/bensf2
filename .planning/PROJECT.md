# SoundFont SF2 & MIDI Workstation (Desktop & Mobile)

## What This Is

Um aplicativo **Sintetizador Sampler de SF2 e Player MIDI Cross-Platform** com **Console de Mixer Multitimbrico** e **Gerenciador de Presets** que roda como aplicativo nativo no **Desktop (Electron.js)** e no **Mobile (Android PWA / Web)**. Inspirado no Native Instruments Kontakt, StudioLogic Numa Player e Audio Evolution Mobile.

## Core Value

Permitir carregar múltiplos bancos de som SF2, manipular canais MIDI, ajustar volume, panorama (PAN), Mute/Solo, aplicar efeitos (Reverb, Delay, EQ, Limiter), e **Salvar e Carregar Presets personalizados** de forma fluida tanto no PC quanto no celular.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **Sintetizador SF2 (SoundFont 2 Engine)**: Carregamento de arquivos `.sf2`, renderização de áudio wavetable polifônica de alta qualidade com Web Audio API, suporte a envelopes ADSR e pitch bend.
- [ ] **Console de Mixer Multitimbrico**: Suporte a até 16 canais MIDI com Faders verticais de Volume, VU Meters estéreo animados em tempo real, knobs de Panorama (PAN L/R), Mute e Solo por pista, e ajuste de transposição por oitavas.
- [ ] **Rack de Efeitos (FX Rack)**: Processadores de Reverb Estéreo, Delay sincronizado com o BPM, Equalizador de 3 Bandas (Low/Mid/High) e Limiter Master para prevenção de distorção.
- [ ] **Player MIDI & Teclado Multi-touch / QWERTY**: Player de arquivos `.mid` com controles de Play, Pause, Stop, Seekbar e BPM. Teclado virtual sensível ao toque no Mobile, atalhos de teclas no Desktop e integração com a WebMIDI API para controladores USB-OTG/Bluetooth.
- [ ] **Gerenciador de Presets (Preset System)**: Salvar e carregar o estado completo de instrumentos, mixer e efeitos em presets personalizados locais ou exportáveis em JSON (suporte a atalhos `Ctrl+S` no Electron).
- [ ] **Suporte Cross-Platform (Electron & Mobile PWA)**: Estrutura executável no Windows/macOS via Electron e responsiva para Android via PWA.

### Out of Scope

- Edição avançada de gravação de áudio multipista por microfone (foco em MIDI e SF2).
- VST/AU plugins externos de terceiros (usará o FX Rack interno de alta fidelidade).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web Audio API + JS/WASM SF2 Engine | Garante latência ultrabaixa e compatibilidade 100% idêntica no Electron (Desktop) e Android (PWA) | Aprovado |
| Vanilla CSS Glassmorphism Dark Mode | Estética premium inspirada em DAWs e instrumentos de ponta sem peso de dependências | Aprovado |
| Preset System via JSON & LocalStorage / Electron Store | Permite salvamento instantâneo e alternância de timbres durante performances | Aprovado |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-08-12 after initialization*
