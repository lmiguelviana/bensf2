# SoundFont SF2 Live Sampler Workstation (Desktop & Mobile)

## What This Is

Um **Sintetizador Sampler de SF2 e Rack de Performance ao Vivo Cross-Platform** com **Console de Mixer Multitimbrico** e **Gerenciador de Presets** que roda como aplicativo nativo no **Desktop (Electron.js)** e no **Mobile (Android PWA / Web)**. O foco exclusivo é conectar um **Teclado Controlador MIDI Real (USB/Bluetooth)** ou tocar no teclado virtual em tempo real. Inspirado no Native Instruments Kontakt e StudioLogic Numa Player.

## Core Value

Conectar um **teclado controlador MIDI físico** (via cabo USB-OTG ou Bluetooth), carregar múltiplos bancos de som SF2, manipular canais MIDI em tempo real, controlar volume, panorama (PAN), Mute/Solo, aplicar efeitos (Reverb, Delay, EQ, Limiter) e **Salvar e Carregar Presets personalizados** instantaneamente em apresentações ao vivo ou ensaios.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **Sintetizador SF2 (SoundFont 2 Engine)**: Carregamento de arquivos `.sf2`, renderização de áudio wavetable polifônica de baixa latência com Web Audio API, suporte a envelopes ADSR, pitch bend e modulação.
- [ ] **Integração com Teclado MIDI Físico (WebMIDI API)**: Reconhecimento plug-and-play de controladores MIDI USB-OTG e Bluetooth MIDI. Mapeamento de canais (CH 1-16), Velocity, Pitch Bend, Mod Wheel (CC1), Sustain Pedal (CC64) e Troca de Programa (Program Change).
- [ ] **Console de Mixer Multitimbrico**: Suporte a múltiplos canais/camadas MIDI com Faders verticais de Volume, VU Meters estéreo animados em tempo real, knobs de Panorama (PAN L/R), Mute e Solo por pista, e transposição de oitavas.
- [ ] **Rack de Efeitos (FX Rack)**: Processadores de Reverb Estéreo, Delay, Equalizador de 3 Bandas (Low/Mid/High) e Limiter Master para prevenção de distorção.
- [ ] **Teclado Virtual Auxiliar Multi-touch / QWERTY**: Teclado na tela sensível ao toque no Mobile e atalhos no teclado do PC para tocar sem controlador.
- [ ] **Gerenciador de Presets (Preset System)**: Salvar e carregar o estado completo de instrumentos, mixer e efeitos em presets personalizados locais ou exportáveis em JSON (com suporte a atalhos `Ctrl+S` no Electron).
- [ ] **Suporte Cross-Platform (Electron & Mobile PWA)**: Executável no Windows/macOS via Electron e responsivo para Android via PWA.

### Out of Scope

- Reprodução ou gravação de arquivos MIDI `.mid` / sequenciador timeline (aplicação 100% focada em execução ao vivo com teclado controlador MIDI).
- Edição de gravação de áudio por microfone.
- VST/AU plugins externos de terceiros.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WebMIDI API Nativas | Suporte direto para teclados controladores MIDI USB e Bluetooth no Chrome Mobile/Android e Electron sem drivers extra | Aprovado |
| Web Audio API + JS SF2 Engine | Latência ultrabaixa imediata para resposta tátil no teclado | Aprovado |
| Preset System via JSON & LocalStorage / Electron Store | Permite salvamento instantâneo e alternância de timbres durante apresentações | Aprovado |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-08-12 (Ajustado para foco exclusivo em Teclado MIDI em tempo real)*
