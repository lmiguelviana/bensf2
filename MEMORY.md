# 🧠 MEMORY.md - Memória do Projeto BenSF2 Live Workstation

Este arquivo contém a memória persistente de decisões arquiteturais, preferências do desenvolvedor (@lmiguelviana), convenções visuais e histórico do projeto **BenSF2**.

---

## 👤 Perfil do Desenvolvedor & Preferências
- **Autor / Desenvolvedor**: Miguel Viana (`@lmiguelviana`, repositório: `https://github.com/lmiguelviana/bensf2`).
- **Filosofia de Design**:
  - Padrão **DAW Workstation High-End Glassmorphic Design** (`gsd-impeccable`).
  - Proibido visual genérico de IA (sem gradients roxos simples, cards desalinhados ou elementos padrão sem estilo).
  - Estética inspirada em teclados de hardware (*Nord Stage 3, Korg Kronos, MainStage e Kontakt*).

---

## 🎨 Design System & Temas Visuais
- **Tema Padrão**: `nord_red` (🔴 **Nord Stage Red Edition** - Vermelho Crimson Nord `#ff2a4b` com LEDs de hardware e visual de alumínio escovado escuro).
- **Temas Disponíveis em Configurações (⚙️)**:
  - `nord_red` — Nord Stage Red Edition (Vermelho Nord Stage 3).
  - `cyberpunk_neon` — Cyberpunk Neon Cyan/Purple (Original).
  - `dark_oberheim` — Dark Oberheim Vintage (Preto & Dourado Pro).
  - `ableton_dark` — Ableton Dark Studio (Cinza Metal Pro).

---

## 🎛️ Funcionalidades Chave do Workstation
1. **Setlist & Song Mode para Shows**:
   - Organiza o repertório do show em ordem de execução.
   - **Instant Workstation Snapshot**: Captura todas as pistas, timbres, volumes, semitones, splits e efeitos ativos.
   - **Seamless Patch Change**: Troca de preset sem interromper o som das notas que ainda estão soando ou sustentadas pelo pedal.
   - **Atalhos Globais de Palco**: Teclas `N` (Próxima Música) / `P` (Música Anterior) ou `PageDown`/`PageUp`.

2. **Formatos SoundFont Aceitos**:
   - Suporte nativo a arquivos **`.sf2`** e **`.sf3`** (SoundFont comprimido em Ogg Vorbis).

3. **Velocidade & Curvas por Pista**:
   - Sliders *MIN VEL*, *MAX VEL*, *CURVA POWER* por pista.
   - Visualizador de 128 Barras Neon a 60 FPS.
   - **Velocity Layer Crossfading**: Transição suave de dinâmica (Equal-Power Crossfade).

4. **Banco de Dados SQLite Persistente**:
   - Módulo `js/database.js` com persistência local em `bensf2_database.sqlite.json`.

5. **Empacotamento VST3 & Desktop App**:
   - C++ JUCE 8 Wrapper em `vst3/`.
   - Script de Instalador Duplo NSIS em `build/installer.nsh` para gravar App Standalone + Plugin VST3 em `C:\Program Files\Common Files\VST3\BenSF2.vst3\`.
