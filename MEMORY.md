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

### 2. 📦 Compatibilidade de Formato SoundFont
- **SF2 PCM**: É o formato de áudio suportado pelo motor atual.
- **SF3/Ogg Vorbis**: O parser reconhece o bit de amostra comprimida, mas ainda não possui decoder Vorbis. Bancos SF3 são rejeitados explicitamente para impedir que bytes comprimidos sejam reproduzidos como PCM e gerem ruído/distorção. É necessário convertê-los para SF2 PCM antes do carregamento.

### 3. 🎹 Zonas de Velocity & Motor de Velocidade por Pista
- **Seleção de zonas SF2**: `keyRange` e `velRange` são critérios estritos. Não há crossfade artificial entre samples, pois isso altera o mapeamento definido pelo próprio banco.
- **Velocity efetiva coerente**: A mesma transformação de curva seleciona a camada `velRange` e define o ganho. O modo `fixed`, por exemplo, não combina mais sample suave com volume forte.
- **Entrada expressiva**: Controladores físicos preservam velocity MIDI 1–127. O teclado virtual usa pressão via Pointer Events quando disponível e posição vertical como fallback determinístico em telas sem sensor de força.
- **Visualizador Canvas 128 Barras (60 FPS)**: Sliders *MIN VEL*, *MAX VEL* e *CURVA POWER* com gráfico neon e marcador de nota em tempo real.
- **Badge Reativa no Mixer**: Atualiza dinamicamente para `VELOCITY ● PISTA` ou `VELOCITY 🌐 GLOBAL`.
- **Persistência**: Presets e snapshots de setlist armazenam configurações globais/por pista; mapeamentos e estado ativo dos dispositivos MIDI ficam no `localStorage`.

### 4. ⚡ Engine de Áudio
- O motor em uso é baseado em nós da Web Audio API. Existe um processador experimental em `js/audio-worklet-processor.js`, mas ele ainda não está conectado ao fluxo de reprodução; portanto, não se deve anunciar AudioWorklet ou latência sub-5 ms como capacidades ativas.

### 5. 🎛️ Plugin Nativo VST3 (JUCE 8 / C++) & Instalador Duplo NSIS
- **Wrapper C++ JUCE 8 (`vst3/`)**: Compilação nativa do arquivo `BenSF2.vst3` com renderizador WebView que exibe a interface exata do aplicativo dentro de DAWs (Reaper, FL Studio, Ableton, Cubase, Studio One).
- **Limite arquitetural confirmado**: O `processBlock()` atual não consome `midiMessages` nem renderiza o motor SF2; ele apenas limpa canais de saída sem entrada. O VST3 ainda não é um instrumento de áudio funcional e requer uma fase própria de integração nativa/ponte em tempo real.
- **Instalador NSIS (`build/installer.nsh`)**: Grava o **App Standalone (`.exe`)** e instala o **Plugin VST3** em `C:\Program Files\Common Files\VST3\BenSF2.vst3\`.

### 6. 💾 Banco de Dados SQLite Persistente & Diálogos Nativos
- **SQLite DB (`js/database.js`)**: Armazenamento local de curvas customizadas em `bensf2_database.sqlite.json`.
- **Janelas Nativas do Windows**: Presets integrados aos handlers IPC `showSaveDialog` e `showOpenDialog` do Electron.

### 7. 📁 Abas Flutuantes Neon & Ícones Transparentes
- **Abas Flutuantes Neon**: `📁 BIBLIOTECA ▶` na borda esquerda e `🎹 EXIBIR TECLADO PIANO ▲` no rodapé.
- **Ícone Transparente**: Imagens PNG Photoroom sem moldura/caixa branca na barra de tarefas do Windows.

### 8. 🎹 Núcleo de Reprodução SF2
- **Parser de zonas (`js/sf2-parser.js`)**: Implementa o subconjunto de geradores necessário para seleção de sample, ranges, afinação, atenuação e loops. A cobertura total da especificação (envelopes nativos, filtros, moduladores e offsets) ainda é trabalho futuro.
- **Síntese baseada no banco (`js/synth-engine.js`)**: Usa as zonas reais de nota e velocidade e não inventa samples quando uma faixa não corresponde. A atenuação segue a compatibilidade EMU e a afinação estática é preservada durante pitch bend.
- **Labels de Áudio Reais do Windows**: Enumeração de dispositivos de áudio com permissões desbloqueadas no Electron (`audioCapture`/`microphone`), exibindo nomes reais (*Alto-falantes HK2*, etc.).
- **Gestão de Controladores MIDI Físicos**: Botões `● ATIVO` / `○ INATIVO` e roteamento de canal por teclado controlador conectado.
- **Semântica de canal**: Canal MIDI externo e número da pista interna são domínios separados. Pistas em `TODOS` formam layer; pistas em `1..16` só respondem ao canal atribuído. Note Off guarda os destinos do Note On para não prender notas após trocar rota, pista ou oitava.
- **MIDI Learn Ampliado em Botões**: Mapeamento por clique com botão direito em todos os botões ON/OFF de efeitos por pista, Master FX, Mute e Solo.
- **Truncamento Estético de Presets (`...`)**: Estilo ajustado no CSS para evitar que nomes extensos de SoundFont estourem o container do Mixer, com tooltip no hover.

---

## 📂 Mapeamento de Arquivos Principais

| Arquivo/Pasta | Responsabilidade no Projeto |
| :--- | :--- |
| [js/setlist-manager.js](file:///d:/Sistemas/bensf2/js/setlist-manager.js) | Gerenciador do Setlist Mode com Instant Snapshot e Seamless Patch Change |
| [js/audio-worklet-processor.js](file:///d:/Sistemas/bensf2/js/audio-worklet-processor.js) | Processador AudioWorklet experimental, ainda não conectado ao motor principal |
| [js/sf2-parser.js](file:///d:/Sistemas/bensf2/js/sf2-parser.js) | Parser binário de SoundFonts SF2 PCM com suporte ao núcleo de geradores de zona |
| [js/synth-engine.js](file:///d:/Sistemas/bensf2/js/synth-engine.js) | Motor de síntese Web Audio com filtragem de zonas SF2 e atenuação nativa |
| [js/performance-input.js](file:///d:/Sistemas/bensf2/js/performance-input.js) | Converte pressão/posição do Pointer Event em velocity MIDI para o teclado virtual |
| [js/web-midi.js](file:///d:/Sistemas/bensf2/js/web-midi.js) | Gerenciador WebMIDI para múltiplos controladores com toggles de ativacao |
| [js/midi-learn.js](file:///d:/Sistemas/bensf2/js/midi-learn.js) | Automação MIDI Learn em sliders e botões ON/OFF |
| [js/database.js](file:///d:/Sistemas/bensf2/js/database.js) | Gerenciador do banco de dados SQLite local |
| [js/settings-modal.js](file:///d:/Sistemas/bensf2/js/settings-modal.js) | Painel de Configurações, áudio com labels reais, polifonia e seletor de temas |
| [js/preset-manager.js](file:///d:/Sistemas/bensf2/js/preset-manager.js) | Integração com diálogos nativos do Windows (`showSaveDialog`) |
| [js/mixer.js](file:///d:/Sistemas/bensf2/js/mixer.js) | Console do Mixer de 16 canais, semitones (0 a 12) e badges |
| [vst3/](file:///d:/Sistemas/bensf2/vst3) | Código nativo do plugin VST3 em C++ JUCE 8 |
| [build/installer.nsh](file:///d:/Sistemas/bensf2/build/installer.nsh) | Script do Instalador Duplo NSIS (App + VST3) |
| [index.html](file:///d:/Sistemas/bensf2/index.html) | Interface principal, modais e abas flutuantes |
| [css/main.css](file:///d:/Sistemas/bensf2/css/main.css) | Estilos Glassmorphism, temas (Nord Red) e Grid responsivo |
| [js/app.js](file:///d:/Sistemas/bensf2/js/app.js) | Controlador master, atalhos de palco e alternador de views |

---

## 🟢 Status de Sincronização Git
- **Repositório**: `https://github.com/lmiguelviana/bensf2.git`
- **Branch**: `main`
- **Garantia**: Todos os commits são mantidos sincronizados com a nuvem no GitHub.
