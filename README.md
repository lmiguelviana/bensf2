# 🎹 BenSF2 - Live Sampler Workstation & Synthesizer Rig

![BenSF2 Banner](assets/icon-512.png)

**BenSF2** é uma **Workstation de Síntese Sampler de SF2 e Rack de Efeitos** de alta performance, desenvolvida para execução ao vivo com teclados controladores MIDI físicos (USB-OTG e Bluetooth) em ambiente **Desktop (Electron)** e **Mobile (PWA / Google Play Store TWA)**.

---

## ✨ Principais Funcionalidades

### 🔊 1. Motor de Síntese Polyphonic SF2 Wavetable
- **Parser Binário Direto**: Leitura e parsing binário nativo em JavaScript de arquivos `.sf2` (SoundFont 2) com alinhamento exato de 46 bytes no bloco `shdr`.
- **Pontos de Looping Infinito**: Suporte automático a `startLoop` e `endLoop` para sustentação contínua de órgãos, pads, cordas e sintetizadores.
- **Polifonia Dinâmica**: Ajuste automático (32 vozes em mobile, 64/128 vozes em desktop) ou limite customizável pelo usuário.
- **Sensibilidade ao Toque**: Curvas de velocidade customizáveis (*Soft*, *Normal*, *Hard*).
- **Pitch Bend em Tempo Real**: Deslocamento suave de tom por semitons sem interrupção das amostras ativas.

### 🎛️ 2. Mixer Console Multitimbrico (16 Canais & Layers)
- **Seleção de Timbres por Pista**: Cada uma das 16 faixas possui seu próprio menu suspenso para atribuição individual de qualquer instrumento do banco SF2.
- **Roteamento de Canais MIDI**: Cada pista pode escutar um canal MIDI específico (`CH 01` a `CH 16`) ou `TODOS (Layer)` para empilhamento de timbres.
- **Controles de Mixagem**: Fader vertical de volume (0 a 100%), slider de Panorama (PAN L/R), Transposição de Oitava (-2 a +2 oitavas), Mute (M) e Solo (S).
- **VU Meters Estéreo**: VU meters individuais em Canvas de alta taxa de atualização com gradientes de LED cyan-para-amarelo e clip indicador.
- **Seleção Dinâmica de Pistas**: Alternância rápida entre visualização de 4, 8, 12 ou 16 pistas completas.

### 🏛️ 3. Rack de Processamento de Efeitos Master (FX Rack)
- **Equalizador 3-Bandas**: Controles VST com Knobs 3D metálicos interativos (Grave 100Hz, Médio 1kHz, Agudo 8kHz).
- **Stereo Delay / Echo**: Tempo ajustável (50ms a 1000ms) e controle de mistura Wet/Dry.
- **Reverb Estéreo**: Resposta de impulso convolutora sintética com tamanho de sala ajustável (10 a 100%) e mistura Wet/Dry.
- **Master Limiter (🛡️ Proteção Ativa -1.0 dB)**: Prevenção automática de distorção ou *clipping* em alto-falantes de dispositivos móveis.

### 🔌 4. WebMIDI API & Suporte a Múltiplos Controladores Físicos
- **Detecção Automática Plug-and-Play**: Conexão rápida via cabo USB-OTG ou Bluetooth MIDI.
- **Múltiplos Controladores Simultâneos**: Permite atribuir diferentes teclados físicos a canais MIDI independentes (ex: Controlador A na Pista 1, Controlador B na Pista 2).
- **Suporte Completo a CC**: Mapeamento de Pedal de Sustain (CC64), ModWheel (CC1), Volume Master (CC7) e Pitch Bend.
- **Iluminação em Tempo Real**: Feedback visual instantâneo das teclas pressionadas no controlador físico.

### ⚙️ 5. Painel de Configurações (`⚙️ Configurações`)
- **Dispositivo de Saída de Áudio**: Seleção dinâmica de alto-falantes/fones via `setSinkId`.
- **Taxa de Amostragem (*Sample Rate*)**: Suporte a 44.1 kHz, 48.0 kHz e 96.0 kHz.
- **Buffer de Áudio / Latência**: Opções de 128 amostras (~2.9ms), 256 amostras (~5.8ms), 512 amostras e 1024 amostras.
- **Mapeamento de Controladores**: Painel dinâmico para gerenciamento de dispositivos MIDI conectados.

### 🎹 6. Teclado Virtual 100% Fluido & Responsivo
- **Extensão Configurável**: Alternância entre 2 Oitavas (24 teclas), 5 Oitavas (61 teclas - padrão sintetizador) e 7 Oitavas (88 teclas - piano completo).
- **Layout Adaptável**: Teclas em porcentagem relativa (`flex: 1 1 0%`) para preenchimento de ponta a ponta sem espaços pretos vazios.
- **Atalhos QWERTY**: Mapeamento para tocar no teclado do computador (`A-S-D-F` para brancas, `W-E-T-Y` para pretas, `Z/X` para oitavas, `Espaço` para Mute).

### 💾 7. Sistema de Presets & Performance Handoff
- **Salvamento Local e Exportação JSON**: Presets salvos via LocalStorage ou exportados como arquivos `.json` reutilizáveis.
- **Atalho Rápido**: `Ctrl+S` / `Cmd+S` para salvar o preset do rig atual instantaneamente.

---

## 🛠️ Arquitetura do Projeto

```
sf2/
├── assets/
│   ├── icon-192.png
│   └── icon-512.png
├── css/
│   ├── main.css          # Design system Dark Glassmorphic e layout fluido
│   ├── mixer.css         # Estilos do Mixer Console e faders
│   ├── synth-rack.css    # Layout dos módulos do FX Rack
│   └── knob.css          # Estilização dos Knobs 3D metallizados
├── js/
│   ├── audio-context.js  # Gerenciador global do Web Audio Context
│   ├── sf2-parser.js     # Parser binário SF2 com alinhamento 46-byte shdr
│   ├── synth-engine.js   # Motor de síntese polifônica e envelopes ADSR
│   ├── fx-rack.js        # Módulos de EQ 3-Band, Delay, Reverb e Limiter
│   ├── vu-meter.js       # VU meters estéreo em Canvas 60 FPS
│   ├── mixer.js          # Console do Mixer Multitimbrico de 16 canais
│   ├── web-midi.js       # Gerenciador WebMIDI com suporte a múltiplos controladores
│   ├── settings-modal.js # Gerenciador do Modal de Configurações de Áudio & MIDI
│   ├── preset-manager.js # Gerenciador de Presets (JSON & LocalStorage)
│   ├── knob-component.js # Componente de Knob Giratório 3D
│   └── app.js            # Controller mestre do aplicativo UI
├── index.html            # Estrutura principal com abas e janela Electron
├── main.js               # Processo principal Electron (janela frameless)
├── preload.js            # Script de preload seguro do Electron
├── manifest.json         # PWA Manifest para instalação web/Android
├── twa-manifest.json     # Configuração Bubblewrap para Google Play Store (.aab)
└── package.json          # Dependências do projeto Electron
```

---

## 🚀 Como Executar o Projeto

### 💻 1. Rodar a Aplicação Desktop (Electron)
```bash
# Instalar dependências
npm install

# Iniciar o aplicativo Electron
npm start
```

### 🌐 2. Rodar como Servidor Web / PWA
```bash
# Executar servidor local HTTP
npm run web

# Acesse no seu navegador: http://localhost:8080
```

### 📱 3. Gerar Pacote Android (.aab) para a Google Play Store
```bash
# Executar compilação via Bubblewrap CLI
npx @bubblewrap/cli build
```

---

## 📜 Licença
Distribuído sob a licença **MIT**. Veja `LICENSE` para mais informações.
