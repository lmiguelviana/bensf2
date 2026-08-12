# Phase 1: Core Project Setup, Audio Engine & SF2 Sampler Engine - Context

**Gathered**: 2026-08-12
**Status**: Ready for planning & execution

<domain>
## Phase Boundary

Esta fase constrói a infraestrutura base do aplicativo (Electron + Web/PWA), o gerenciador do contexto de áudio da Web Audio API e o motor binário de parser e síntese polifônica do formato SoundFont 2 (`.sf2`).
</domain>

<decisions>
## Implementation Decisions

### 1. Polifonia e Desempenho (Auto + Controle Manual)
- **Modo Automático por Padrão (Recomendado)**: A polifonia é detectada e ajustada automaticamente com base no dispositivo (ex: 32 vozes para mobile, 64 vozes para desktop).
- **Sobrescrita Manual pelo Usuário**: O usuário pode alterar a qualquer momento para valores fixos (16, 32, 64 ou 128 vozes) no seletor da interface.
- **Gerenciamento de Vozes**: Liberação automática da nota mais antiga (*voice stealing*) ao atingir o limite.

### 2. Resposta de Velocidade (Touch Sensitivity)
- **Curvas de Velocidade Selecionáveis**: O usuário pode alternar entre curvas de sensibilidade (Suave, Normal e Dura) para adaptar a resposta ao toque de qualquer teclado controlador MIDI físico.

### 3. Atalhos de Teclado QWERTY (Desktop Electron)
- **Mapeamento de Teclas**: Layout QWERTY Piano (Fileira A-S-D-F para teclas brancas, W-E-T-Y para pretas).
- **Controles Auxiliares**: Teclas `Z` e `X` para trocar de oitava rapidamente; Barra de Espaço para Silenciar/Mudar o Mute de saída.

### 4. Comportamento de Inicialização e Fallback de Som
- **Modo Silencioso até Upload**: Exibir aviso visual *"Carregue um arquivo .sf2 para começar a tocar"* na inicialização. O motor aguarda a seleção/upload de um arquivo SoundFont antes de emitir áudio.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/PROJECT.md` — Visão geral da Workstation Live e escolhas de arquitetura.
- `.planning/REQUIREMENTS.md` — Requisitos do motor SF2 e integração com teclados MIDI.
- `.planning/ROADMAP.md` — Estrutura das 4 fases do projeto.
</canonical_refs>

<specifics>
## Specific Ideas

- Adicionar opção "Auto (Recomendado)" como valor padrão no dropdown de Polifonia na barra superior.
- Adicionar indicador de uso de polifonia no painel lateral de estatísticas.
</specifics>

<deferred>
## Deferred Ideas

- Gravação de áudio em tempo real para arquivo WAV/MP3 (diferida para marcos futuros).
</deferred>
