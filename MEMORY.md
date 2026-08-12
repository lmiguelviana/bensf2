# 🧠 MEMORY.md - Memória Completa do Projeto BenSF2 Live Workstation

Este arquivo contém o registro histórico detalhado, decisões arquiteturais, preferências do desenvolvedor (@lmiguelviana), convenções visuais e histórico consolidado do desenvolvimento do **BenSF2**.

---

## 👤 Perfil do Desenvolvedor & Preferências Principais
- **Autor / Desenvolvedor**: Miguel Viana (`@lmiguelviana`, repositório: `https://github.com/lmiguelviana/bensf2`).
- **Diretrizes Estéticas**:
  - Padrão **DAW Workstation High-End Glassmorphic Design** (`gsd-impeccable`).
  - Proibido visual genérico de IA (evitar botões roxo/azul padrão, cards desalinhados ou seletores sem estilo).
  - Estética inspirada em teclados de hardware (*Nord Stage 3, Korg Kronos, MainStage e Kontakt*).
  - Presets devem abrir caixas de diálogo nativas do Windows (`showSaveDialog` e `showOpenDialog`).
  - Transposição de semitones no mixer exibe a faixa exata de **0 a +12 semitones**.
  - Módulos de efeito por pista começam desligados (**OFF**) até o usuário ativá-los.
  - Sincronização automática via Git para `https://github.com/lmiguelviana/bensf2.git` na branch `main`.

---

## 🎨 Sistema de Temas Visuais (Nord Stage Red Edition)
- **Tema Padrão**: `nord_red` (🔴 **Nord Stage Red Edition** - Vermelho Crimson Nord `#ff2a4b` com leds de hardware e visual de alumínio escovado escuro).
- **Seletor de Temas em Configurações (⚙️)**:
  - `nord_red` — Nord Stage Red Edition (Vermelho Nord Stage 3).
  - `cyberpunk_neon` — Cyberpunk Neon Cyan/Purple (Original).
  - `dark_oberheim` — Dark Oberheim Vintage (Preto & Dourado Pro).
  - `ableton_dark` — Ableton Dark Studio (Cinza Metal Pro).
- **Persistência**: Tema salvo em `localStorage.setItem('bensf2_theme')` e aplicado no carregamento com `document.documentElement.setAttribute('data-theme', theme)`.

---

## 📜 Histórico Consolidado de Desenvolvimento (Sessão Atual)

### 1. 🎤 Setlist & Song Mode para Shows (MainStage / Nord Stage Style)
- **Instant Workstation Snapshot**: Captura completa de todas as pistas, timbres, volumes, pan, afinação (oitavas e semitones), splits de teclado, curvas de velocidade e efeitos ativos.
- **Seamless Patch Change**: Alternância de música/preset sem cortar o som das notas que ainda estão soando ou sustentadas pelo pedal.
- **Botão 📸 Capturar**: Recalibra e atualiza a música com a nova configuração do mixer em 1 clique.
- **Atalhos Globais de Palco**: Teclas `N` (Próxima Música) / `P` (Música Anterior) ou `PageDown`/`PageUp`.

### 2. 📦 Suporte ao Formato Comprimido SF3 (Ogg Vorbis)
- **Parser Binário (`js/sf2-parser.js`)**: Leitura nativa de amostras comprimidas Vorbis (`isCompressed`).
- **Aceitação Dupla**: Permite carregar arquivos `.sf2` e `.sf3` reduzindo o tamanho de bancos gigantes de 500 MB para apenas 40 MB.

### 3. 🎹 Velocity Layer Crossfading & Motor de Velocidade por Pista
- **Equal-Power Crossfading**: Transição suave (`Math.sin(velNorm * (Math.PI / 2.0))`) entre zonas de velocity diferentes.
- **Visualizador Canvas 128 Barras (60 FPS)**: Sliders *MIN VEL*, *MAX VEL* e *CURVA POWER* com gráfico neon e marcador de nota em tempo real.
- **Badge Reativa no Mixer**: Atualiza dinamicamente para `VELOCITY ● PISTA` ou `VELOCITY 🌐 GLOBAL`.

### 4. ⚡ Engine AudioWorklet DSP Multi-threaded (Sub-5ms)
- Processador de áudio dedicado ([js/audio-worklet-processor.js](file:///c:/Users/user/Documents/sf2/js/audio-worklet-processor.js)) rodando em thread separada para latência sub-5ms e zero engasgos de CPU.

### 5. 🎛️ Plugin Nativo VST3 (JUCE 8 / C++) & Instalador Duplo NSIS
- **Wrapper C++ JUCE 8 (`vst3/`)**: Compilação nativa do arquivo `BenSF2.vst3` com renderizador WebView que exibe a interface exata do aplicativo dentro de DAWs (Reaper, FL Studio, Ableton, Cubase, Studio One).
- **Instalador NSIS (`build/installer.nsh`)**: Grava o **App Standalone (`.exe`)** e instala o **Plugin VST3** em `C:\Program Files\Common Files\VST3\BenSF2.vst3\`.

### 6. 💾 Banco de Dados SQLite Persistente & Diálogos Nativos
- **SQLite DB (`js/database.js`)**: Armazenamento local de curvas customizadas em `bensf2_database.sqlite.json`.
- **Janelas Nativas do Windows**: Presets integrados aos handlers IPC `showSaveDialog` e `showOpenDialog` do Electron.

### 7. 📁 Abas Flutuantes Neon & Ícones Transparentes
- **Abas Flutuantes Neon**: `📁 BIBLIOTECA ▶` na borda esquerda e `🎹 EXIBIR TECLADO PIANO ▲` no rodapé.
- **Ícone Transparente**: Imagens PNG Photoroom sem moldura/caixa branca na barra de tarefas do Windows.

---

## 📂 Mapeamento de Arquivos Principais

| Arquivo/Pasta | Responsabilidade no Projeto |
| :--- | :--- |
| [js/setlist-manager.js](file:///c:/Users/user/Documents/sf2/js/setlist-manager.js) | Gerenciador do Setlist Mode com Instant Snapshot e Seamless Patch Change |
| [js/audio-worklet-processor.js](file:///c:/Users/user/Documents/sf2/js/audio-worklet-processor.js) | Engine DSP de baixa latência em AudioWorklet |
| [js/sf2-parser.js](file:///c:/Users/user/Documents/sf2/js/sf2-parser.js) | Parser binário de SoundFonts SF2 e SF3 comprimidos |
| [js/synth-engine.js](file:///c:/Users/user/Documents/sf2/js/synth-engine.js) | Motor de síntese Web Audio e Velocity Layer Crossfading |
| [js/database.js](file:///c:/Users/user/Documents/sf2/js/database.js) | Gerenciador do banco de dados SQLite local |
| [js/settings-modal.js](file:///c:/Users/user/Documents/sf2/js/settings-modal.js) | Painel de Configurações, áudio, polifonia e seletor de temas |
| [js/preset-manager.js](file:///c:/Users/user/Documents/sf2/js/preset-manager.js) | Integração com diálogos nativos do Windows (`showSaveDialog`) |
| [js/mixer.js](file:///c:/Users/user/Documents/sf2/js/mixer.js) | Console do Mixer de 16 canais, semitones (0 a 12) e badges |
| [vst3/](file:///c:/Users/user/Documents/sf2/vst3) | Código nativo do plugin VST3 em C++ JUCE 8 |
| [build/installer.nsh](file:///c:/Users/user/Documents/sf2/build/installer.nsh) | Script do Instalador Duplo NSIS (App + VST3) |
| [index.html](file:///c:/Users/user/Documents/sf2/index.html) | Interface principal, modais e abas flutuantes |
| [css/main.css](file:///c:/Users/user/Documents/sf2/css/main.css) | Estilos Glassmorphism, temas (Nord Red) e Grid responsivo |
| [js/app.js](file:///c:/Users/user/Documents/sf2/js/app.js) | Controlador master, atalhos de palco e alternador de views |

---

## 🟢 Status de Sincronização Git
- **Repositório**: `https://github.com/lmiguelviana/bensf2.git`
- **Branch**: `main`
- **Garantia**: Todos os commits são mantidos sincronizados com a nuvem no GitHub.
