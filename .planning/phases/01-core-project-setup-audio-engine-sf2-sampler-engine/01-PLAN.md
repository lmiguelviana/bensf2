# Phase 1 Plan: Core Project Setup, Audio Engine & SF2 Sampler Engine

**Phase Goal**: Configurar a estrutura base da aplicação (Electron + Web/PWA), construir o gerenciador da Web Audio API e desenvolver o motor binário de parser e síntese polifônica de arquivos SoundFont 2 (`.sf2`) com suporte a envelopes ADSR e baixa latência.

---

## Task 1: Estrutura do Projeto e Configuração Base (Desktop & Mobile)
- **Goal**: Criar a estrutura de diretórios do projeto, manifestos e processo principal do Electron.
- **Files**:
  - `package.json`
  - `main.js` (Electron main process)
  - `preload.js` (Electron context bridge)
  - `index.html` (Estrutura UI base em HTML5)
  - `css/main.css` (Design system base Dark Mode + Glassmorphism)

## Task 2: AudioContext Manager & Master Output (Web Audio API)
- **Goal**: Desenvolver o módulo central de áudio para gerenciar o contexto do navegador/Electron, controle de volume geral e limiter master.
- **Files**:
  - `js/audio-context.js`

## Task 3: SF2 SoundFont Binary Parser & Wavetable Synth Engine
- **Goal**: Implementar o decodificador binário de formato SF2 (RIFF/LIST chunks, sample headers, zones) e o sintetizador de vozes polifônicas wavetable com envelope ADSR e Pitch Bend.
- **Files**:
  - `js/sf2-parser.js`
  - `js/synth-engine.js`

## Task 4: Asset SoundFont Padrão e Verificação de Áudio
- **Goal**: Incluir banco de som SF2 padrão para demonstração imediata e validar emissão sonora com baixa latência.
- **Files**:
  - `assets/soundfonts/default.sf2` (ou gerador de áudio fallback)
  - `js/app.js` (Lógica de inicialização e ligação dos componentes)

---

## Verification Criteria
- [ ] O projeto inicia sem erros de sintaxe ou dependências.
- [ ] O `AudioContext` é inicializado corretamente após interação do usuário.
- [ ] Arquivos `.sf2` são decodificados com sucesso pela engine.
- [ ] Notas polifônicas são emitidas sem estalos, estalidos ou distorção.
