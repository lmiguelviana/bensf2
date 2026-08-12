# BenSF2 - Live Sampler Workstation & Synthesizer Rig (Desktop & Mobile)

## What This Is

Um **Sintetizador Sampler de SF2 e Rack de Performance ao Vivo Cross-Platform** com **Console de Mixer Multitimbrico de 16 Canais**, **Rack de Efeitos Master**, **Gerenciador de Presets** e **Suporte a Múltiplos Controladores MIDI Físicos** preparado para distribuição na **Google Play Store (Android)** e executável nativo no **Desktop (Electron.js)**. Inspirado no Native Instruments Kontakt e StudioLogic Numa Player.

## Core Value

Conectar um ou múltiplos **teclados controladores MIDI físicos** (via cabo USB-OTG ou Bluetooth), carregar arquivos de som `.sf2` (SoundFont 2), manipular 16 canais MIDI em tempo real, controlar volume, panorama (PAN), Mute/Solo, transposição de oitavas, aplicar efeitos (Reverb, Delay, EQ 3-Band com Knobs 3D, Limiter) e **Salvar e Carregar Presets personalizados** instantaneamente em apresentações ao vivo ou ensaios, disponível diretamente para download nas lojas de aplicativos (Google Play Store via TWA/Manifest).

## Requirements

### Validated & Delivered

- [x] **Sintetizador BenSF2 (SoundFont 2 Engine)**: Carregamento de arquivos `.sf2`, alinhamento exato de 46 bytes no bloco `shdr`, pontos de loop contínuo (`startLoop`/`endLoop`), renderização de áudio polifônica com Web Audio API, envelopes ADSR, pitch bend e sanitização de sampleRate.
- [x] **Integração com Teclados MIDI Físicos (WebMIDI API Multi-Dispositivo)**: Reconhecimento plug-and-play de controladores MIDI USB-OTG e Bluetooth MIDI com suporte a múltiplos dispositivos físicos simultâneos mapeados por canal MIDI, Velocity, Pitch Bend, Mod Wheel (CC1), Sustain Pedal (CC64) e Volume Master (CC7).
- [x] **Console de Mixer Multitimbrico (16 Canais & Layers)**: Suporte a 16 canais/camadas MIDI com faders verticais de Volume, seletores de timbres por pista, seletores de canais MIDI de entrada por pista, VU Meters estéreo em Canvas 60 FPS, Panorama (PAN L/R), Mute e Solo por pista, transposição de oitava e alternância rápida entre 4, 8, 12 e 16 pistas.
- [x] **Rack de Efeitos Master (FX Rack)**: Processadores de Reverb Estéreo, Delay Estéreo, Equalizador de 3 Bandas (Grave/Médio/Agudo com Knobs 3D metálicos) e Limiter Master (-1.0 dB).
- [x] **Painel de Configurações (`⚙️ Configurações`)**: Modal glassmorphic para alteração de dispositivo de saída de áudio, taxa de amostragem (44.1/48/96 kHz), tamanho de buffer (128 a 1024 amostras) e roteamento de múltiplos controladores MIDI.
- [x] **Teclado Virtual 100% Fluido e Adaptável**: Extensão de 24 teclas (2 oitavas), 61 teclas (5 oitavas) ou 88 teclas (7 oitavas - piano completo) com preenchimento em porcentagem relativa (`flex: 1 1 0%`) e atalhos QWERTY.
- [x] **Gerenciador de Presets (Preset System)**: Salvar e carregar o estado completo de instrumentos, mixer e efeitos em presets JSON ou LocalStorage (com suporte ao atalho `Ctrl+S`).
- [x] **Distribuição na Google Play Store (TWA / Manifest)**: Geração de pacote Android App Bundle (.aab) via Bubblewrap CLI a partir do `twa-manifest.json` e `manifest.json`.

### Out of Scope

- Reprodução ou gravação de arquivos MIDI `.mid` / sequenciador timeline (aplicação 100% focada em execução ao vivo com teclado controlador MIDI).
- Edição de gravação de áudio por microfone.
- VST/AU plugins externos de terceiros.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Google Play Store via TWA / Manifest | Permite empacotar o projeto via Bubblewrap CLI a partir do manifest.json para gerar o Android App Bundle (.aab) oficial da loja | Aprovado |
| WebMIDI API Nativas Multi-Dispositivo | Suporte direto para múltiplos teclados controladores MIDI USB e Bluetooth no Chrome Mobile/Android e Electron | Aprovado |
| Web Audio API + Parser SF2 JS | Latência ultrabaixa imediata com alinhamento binário de 46-bytes no shdr para resposta tátil | Aprovado |
| Preset System via JSON & LocalStorage | Permite salvamento instantâneo e alternância de timbres durante apresentações com atalho Ctrl+S | Aprovado |
| Janela Frameless com Titlebar Overlay | Integração estética premium do aplicativo Electron no Windows/macOS | Aprovado |

---
*Last updated: 2026-08-12 (Renomeado para BenSF2 e todas as funcionalidades validadas com sucesso)*
