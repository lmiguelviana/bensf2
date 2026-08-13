---
title: BenSF2 — Auditoria Sistêmica de UX/UI e Fluxos
audit_type: systemic-ui-ux
scope: whole-application
audited_at: 2026-08-12
baseline: abstract-six-pillar-standards
ui_spec: absent
mode: code-only
screenshots: not-captured-browser-automation-unavailable
automated_baseline: 39/39-tests-passing-with-real-sf2-fixture
score: 10/24
verdict: BLOCKER
status: findings-open
---

# BenSF2 — Auditoria Sistêmica de UX/UI

## Veredito

**O sistema ainda não está pronto para uso confiável em apresentação ao vivo, mobile ou por pessoas que dependem de teclado/leitor de tela.** A casca visual tem direção clara e o conjunto atual de 39 testes passa, inclusive com um SF2 real, mas esses testes não cobrem os fluxos de DOM, acessibilidade, Setlist, restauração completa de FX, configurações ou segurança de conteúdo. A auditoria encontrou defeitos que podem deixar canais mudos, remover a pista errada, restaurar FX com ganho extremo, congelar ao recriar um reverb e comunicar sucesso quando nada foi aplicado.

Não existe `UI-SPEC.md`; portanto, a implementação foi comparada aos seis pilares abstratos do GSD e aos próprios requisitos do projeto. Os documentos de planejamento não foram aceitos como prova de conclusão: `ROADMAP.md` declara a fase 4 concluída, enquanto `STATE.md` ainda aponta a fase 3 e manda iniciar a fase 4.

## Pillar Scores

| Pilar | Score | Classificação | Evidência principal |
|---|---:|---|---|
| 1. Copywriting | 2/4 | WARNING | Atalho de Setlist contraditório, termos técnicos/idiomas misturados e afirmações que não correspondem à implementação. |
| 2. Visuals | 2/4 | WARNING | Há hierarquia de cards e estados ativos, mas a interface é excessivamente densa, depende de emojis e não oferece equivalentes acessíveis para controles customizados. |
| 3. Color | 2/4 | WARNING | Tokens existem, porém 60 cores hex e 123 usos `rgb/rgba` hardcoded quebram consistência entre temas e estados. |
| 4. Typography | 1/4 | BLOCKER | O núcleo da interface usa texto de 8–12 px; foram encontrados 12 tamanhos distintos e forte concentração em 9–11 px. |
| 5. Spacing | 2/4 | WARNING | Há escala de raios/gaps, mas 222 estilos inline, apenas um breakpoint e nenhum alvo mínimo de 44 px tornam desktop/mobile inconsistentes. |
| 6. Experience Design | 1/4 | BLOCKER | Preset/FX, Solo/Mute, remoção de pista, Sustain, configurações e Setlist têm falhas de tarefa ou feedback falso. |

**Overall: 10/24 — BLOCKER**

## Top 3 Priority Fixes

1. **Tornar o recall de Preset/Setlist determinístico e seguro** — hoje unidades percentuais são carregadas como valores normalizados, FX por pista não são capturados e estados ON/OFF não são persistidos; isso pode produzir ganho 20–30x e uma resposta de impulso enorme.
2. **Corrigir a máquina de estados de palco** — separar Mute manual de Mute efetivo por Solo, remover a pista solicitada de fato, desativar pistas ocultas e alinhar navegação/feedback do Setlist.
3. **Criar uma camada de interação acessível e mobile** — semântica ARIA, foco, teclado, alvos touch, zoom, modais responsivos e um comando Panic/All Notes Off precisam fazer parte dos controles centrais, não ser remendos posteriores.

## Evidência automatizada da auditoria

- 39/39 testes Node passaram com `GeneralUser-GS.sf2`; isso valida regressões do parser, roteamento MIDI e velocity, não a experiência completa.
- HTML estático: 47 botões, 13 inputs, 13 selects e 11 labels; **0 labels possuem `for`**.
- Busca em `index.html`, `css/` e `js/`: **nenhum** `aria-*`, `role`, `tabindex`, `aria-live` ou `:focus-visible`.
- 157 estilos inline no HTML; 222 somando templates de UI em JavaScript.
- CSS: 12 tamanhos tipográficos distintos; os mais usados são 11 px (14 ocorrências), 10 px (5), 9 px (5) e 8 px (2).
- Apenas um media query (`max-width: 900px`); nenhum suporte a `prefers-reduced-motion`, `forced-colors` ou `prefers-contrast`.
- Nenhum alvo mínimo de 44×44 px foi definido.
- Screenshots não foram capturados: a sessão foi explicitamente fornecida sem Playwright/Chrome. A análise visual é, portanto, somente de código e não substitui uma inspeção renderizada posterior.

## Achados detalhados

### UX-001 — Recall de FX pode distorcer ou congelar

**Severidade: BLOCKER**

**Evidência:** `FxRackManager.masterParams` guarda `chorusMix`, `delayMix`, `reverbMix` e `reverbSize` como percentuais (`js/fx-rack.js:38-44`). Ao carregar, `PresetManager` passa 30, 20, 25 e 40 diretamente para setters que esperam valores de 0 a 1 (`js/preset-manager.js:193-212`; `js/fx-rack.js:339-377`). `setMasterReverbSize(40)` pode gerar uma resposta de impulso próxima de 140 segundos. Além disso, o preset tenta ler `fxRack.trackParams`, propriedade inexistente — os parâmetros reais estão em `channelFx`, um `Map` (`js/preset-manager.js:39,248-250`; `js/fx-rack.js:46-49,168-198`). Os flags `master*Enabled` também ficam fora de `masterParams` e não são salvos.

**Reprodução:** ative Reverb/Delay Master, salve um preset com os valores padrão e carregue-o; inspecione `masterParams`, gains e duração do convolver. Salve também um FX por pista, altere-o e recarregue: o estado original não volta.

**Correção:** definir um schema versionado único; serializar mixes em uma unidade canônica; salvar flags ON/OFF; copiar `channelFx.get(ch).params`; validar/migrar JSON importado; restaurar nós e UI pela mesma função; adicionar round-trip automatizado com assertions de gain, duração e toggles.

### UX-002 — Solo destrói o estado de Mute manual

**Severidade: BLOCKER**

**Evidência:** `handleSoloToggle()` usa `setChannelMute()` para silenciar canais não solo (`js/mixer.js:639-660`). Esse setter também grava `channels[ch].muted` (`js/synth-engine.js:683-687`). Ao desligar Solo, o código lê o valor já sobrescrito e mantém os demais canais mudos.

**Reprodução:** com CH1 e CH2 audíveis, ative Solo em CH1 e depois desative. CH2 permanece com `muted=true` e sem som.

**Correção:** manter `manualMuted`/`solo` como estado persistente e calcular `effectiveMuted = manualMuted || (hasSolo && !solo)` sem sobrescrever o Mute manual.

### UX-003 — Remover ou ocultar pistas afeta a pista errada

**Severidade: BLOCKER**

**Evidência:** `removeChannel(ch)` silencia o canal clicado, decrementa `totalChannels` e renderiza novamente CH1…CHN, sem remover/compactar o canal solicitado (`js/mixer.js:671-699`). Remover CH2 de quatro pistas deixa CH2 visível e silenciado, enquanto CH4 desaparece. `setVisibleChannelCount()` apenas reduz a UI (`js/mixer.js:67-70`), mas o sintetizador continua roteando pelas 16 pistas (`js/synth-engine.js:342-360,410-417`). Uma pista 5 configurada pode continuar soando depois de o seletor mostrar quatro pistas.

**Reprodução:** configure timbres diferentes em CH2/CH4, remova CH2; em seguida configure CH5, mude “Pistas” para 4 e envie MIDI ao canal de CH5.

**Correção:** modelar pistas por ID estável; remover/shiftar explicitamente o estado solicitado; parar vozes e desconectar/desabilitar canais ocultos; confirmar ações destrutivas ou oferecer Undo.

### UX-004 — Configurações prometem aplicar controles que são ignorados

**Severidade: BLOCKER**

**Evidência:** `sampleRateSelect` e `bufferSizeSelect` são capturados, mas `applySettings()` nunca os lê, salva ou aplica (`js/settings-modal.js:25-35,315-333`). A troca de saída é assíncrona, não é aguardada e falhas apenas vão ao console (`js/settings-modal.js:320-332,339-363`); ainda assim o modal fecha e mostra sucesso. Tema, velocity, polifonia e MIDI são aplicados imediatamente antes de “Salvar”, tornando fechar/cancelar semanticamente inconsistente.

**Reprodução:** escolha 96 kHz e buffer 128, salve, reabra e verifique `AudioContext.sampleRate`/estado persistido; simule `setSinkId()` ausente ou rejeitado e observe o alerta de sucesso.

**Correção:** remover opções não suportadas ou recriar explicitamente o contexto com explicação e confirmação; aguardar saída de áudio e reportar erro; usar estado rascunho no modal e aplicar tudo apenas no CTA; exibir valores efetivos do dispositivo.

### UX-005 — Solicitação de microfone inesperada e fora do escopo

**Severidade: BLOCKER**

**Evidência:** a lista de saída de áudio é carregada durante `init()` (`js/settings-modal.js:87-89`) e chama `getUserMedia({audio:true})` (`js/settings-modal.js:123-143`). Isso pode pedir permissão de microfone na abertura do app, embora `.planning/PROJECT.md` declare gravação por microfone fora do escopo. No Electron, `main.js:31-43` aprova inclusive permissões desconhecidas.

**Reprodução:** limpe permissões do site e abra o app sem entrar em Configurações.

**Correção:** não pedir captura para enumerar saídas no boot; solicitar apenas por gesto explícito, com explicação, ou usar nomes genéricos/seleção de saída suportada. Restringir a allowlist Electron e negar permissões desconhecidas.

### UX-006 — Sustain e Mod Wheel declarados não cumprem a tarefa musical

**Severidade: BLOCKER**

**Evidência:** CC64 apenas altera `sustainPedalActive` (`js/web-midi.js:252-254`) e nenhum `noteOff` consulta essa flag. CC1 não possui rota padrão; só funciona se o usuário criar manualmente um mapping genérico. Isso contradiz `REQ-SF2-4`, `REQ-MIDI-2` e a declaração de funcionalidade entregue em `PROJECT.md`.

**Reprodução:** segure CC64, solte uma nota e ouça/inspecione a voz; mova CC1 sem MIDI Learn.

**Correção:** manter notas deferidas por dispositivo/canal enquanto pedal ≥64, liberá-las na subida do pedal, implementar CC123/120 e definir modulação real/roteável para CC1 com estado visual.

### UX-007 — Setlist pode navegar para o lado oposto e confirmar um som inexistente

**Severidade: BLOCKER**

**Evidência:** o botão diz “Anterior (N)” e “Próxima (M)” (`index.html:433-434`), mas o código usa N/PageDown para próxima e P/PageUp para anterior (`js/app.js:1466-1474`). Na primeira execução são inseridas três músicas demo que referenciam presets inexistentes e a primeira aparece ativa (`js/setlist-manager.js:18-31,273-328`). `selectSong()` mostra toast de sucesso mesmo quando o preset não existe (`js/setlist-manager.js:197-228`). O snapshot tenta capturar propriedades raiz inexistentes como `fxRack.reverbMix` (`js/setlist-manager.js:73-79`).

**Reprodução:** abra Setlist em armazenamento limpo, pressione N esperando “Anterior” e selecione uma música demo sem presets carregados.

**Correção:** remover dados demo do estado produtivo ou marcá-los claramente como tutorial; alinhar N/P/M entre copy e listeners; bloquear/avisar item sem snapshot/preset; persistir o schema completo de FX e mostrar confirmação somente após aplicação validada.

### UX-008 — Controles essenciais são invisíveis para leitor de tela e inacessíveis por teclado

**Severidade: BLOCKER**

**Evidência:** não há `aria-*`, `role`, `tabindex`, `aria-live` ou `:focus-visible`. As teclas do piano são `div` com Pointer Events (`js/app.js:1304-1352`), presets e Setlist usam cards clicáveis, pistas são selecionadas por `div` e renomeadas apenas com duplo clique, e knobs são `div` com mouse/touch (`js/knob-component.js:25-40,70-118`). Tabs não usam `tablist/tab/aria-selected`; modais não usam `dialog/aria-modal`; toasts não têm região viva (`js/app.js:43-70`). Nenhum dos 11 labels está associado via `for`.

**Reprodução:** percorra apenas com Tab/Enter/Espaço ou leia a página com NVDA; tente selecionar pista/timbre, ajustar knob, tocar tecla, ouvir toast e fechar/navegar modal.

**Correção:** usar elementos nativos quando possível; implementar padrão WAI-ARIA de tabs/dialog/slider; `aria-valuenow`, nomes e instruções; foco inicial, trap, Escape e restauração; `role=status/alert`; foco visível global; tornar cards/teclas operáveis por teclado.

### UX-009 — Mobile/touch não atende legibilidade nem tamanho de alvo

**Severidade: BLOCKER**

**Evidência:** viewport proíbe zoom (`index.html:5`); teclas brancas podem chegar a 8 px e pretas a 5 px (`css/main.css:877-918`); botões usam padding de 2–8 px e texto de 9–11 px; não há alvo de 44 px. Os modais customizados têm largura inline de 400/440 px sem `max-width` (`index.html:641-718`). O header não quebra linha e há apenas um breakpoint superficial (`css/main.css:949-967`). MIDI Learn depende de botão direito (`js/midi-learn.js:61-73`), sem gesto mobile explícito.

**Reprodução:** viewport 375×812; abra “Adicionar Música”, use 88 teclas e tente Mute/Solo/Reset/MIDI Learn com toque.

**Correção:** permitir zoom; breakpoints para header/modal/rack; `min-height/min-width:44px` para ações; modo de teclado mobile com janela rolável e teclas ≥32–40 px; botão/menu explícito de MIDI Learn.

### UX-010 — MIDI Learn falha em Mute/Solo e perde vínculos após re-render

**Severidade: BLOCKER**

**Evidência:** para botões, `MidiLearnManager` chama `targetElement.click()` e depois o callback (`js/midi-learn.js:160-177`). Os callbacks de Mute/Solo também chamam `.click()` (`js/mixer.js:621-633`), produzindo dois toggles e estado final inalterado. A chave de controles sem ID inclui `className`; depois de adicionar `midi-linked`, a chave muda (`js/midi-learn.js:179-180,207-210`). `renderMixer()` destrói os elementos, mas bindings continuam apontando para elementos antigos.

**Reprodução:** aprenda um CC em Mute, envie valor >64; depois aprenda Volume, altere a contagem de pistas/carregue preset e mova o CC.

**Correção:** definir contrato único por binding (callback ou click, nunca ambos); IDs estáveis; rebind por modelo após render; uma única associação por CC com limpeza simétrica; persistência e feedback visual/testes.

### UX-011 — Salvar preset mistura persistência e exportação, com sucesso falso

**Severidade: WARNING**

**Evidência:** criar/salvar sempre grava LocalStorage e imediatamente abre Save As/download (`js/preset-manager.js:77-94,97-121`). Em palco, Ctrl+S pode abrir um diálogo modal do sistema. Falhas de LocalStorage são engolidas (`js/preset-manager.js:385-400`), mas a interface mostra “salvo”. Colisão de nome sobrescreve sem confirmação. O load tenta atualizar IDs inexistentes `polyphonySelect`/`velocityCurveSelect`, em vez dos IDs `modal...` reais (`js/preset-manager.js:175-185`; `index.html:562-579`).

**Reprodução:** pressione Ctrl+S durante execução; force quota/erro de storage; carregue preset com polyphony/velocity e abra Configurações.

**Correção:** separar “Salvar” de “Exportar JSON”; Ctrl+S salva silenciosamente com confirmação não bloqueante; tratar erro/quota; confirmar overwrite; sincronizar todos os controles pelo estado efetivo.

### UX-012 — Conteúdo não confiável entra em `innerHTML`; no Electron o impacto alcança arquivos

**Severidade: BLOCKER**

**Evidência:** nomes de SF2/presets entram em template HTML (`js/app.js:1583-1593`), nomes de pista importados/renomeados entram no mixer (`js/mixer.js:164-246,268-345`), música/notas entram no Setlist (`js/setlist-manager.js:273-332`) e nomes de dispositivos entram em Configurações (`js/settings-modal.js:197-263`). O preload expõe `writeFile(filePath, content)` ao renderer (`preload.js:3-11`). Um nome malicioso pode executar HTML/event handler e, no Electron, invocar IPC de escrita.

**Reprodução:** importe preset/setlist com nome contendo markup/event handler ou carregue arquivo com nome HTML; observe a criação via `innerHTML`.

**Correção:** construir DOM com `textContent`/`option.textContent`; sanitizar/validar JSON e nomes; nunca interpolar IDs/names em HTML; restringir caminhos IPC a diálogos emitidos pelo main e usar tokens de autorização de curta duração.

### UX-013 — Loops visuais e analysers acumulam custo em mobile

**Severidade: WARNING**

**Evidência:** cada `VelocityVisualizerManager` redesenha em todo frame mesmo sem evento (`js/velocity-visualizer.js:27-35,55-152`); são criadas instâncias para Configurações e pista já no boot, inclusive com modal oculto (`js/settings-modal.js:48-51`; `js/app.js:930-941`). Cada `renderMixer()` conecta novos `AnalyserNode`s, mas os antigos nunca são desconectados (`js/mixer.js:97-113`; `js/vu-meter.js:14-29`). Não há pausa por `visibilitychange` nem `prefers-reduced-motion`.

**Reprodução:** altere contagem de pistas/carregue presets repetidamente e inspecione grafo/CPU; deixe app em background.

**Correção:** lifecycle `destroy/disconnect`, reaproveitar analyser por canal, render on-demand quando possível, pausar quando oculto e reduzir FPS adaptativamente.

### UX-014 — Feedback de carregamento, erro e destruição é incompleto

**Severidade: WARNING**

**Evidência:** SF2 grande usa `FileReader` sem progresso, estado busy, cancelamento ou desativação de ações (`js/app.js:1540-1577`). Erros de storage/Setlist são silenciados (`js/preset-manager.js:385-400`; `js/setlist-manager.js:243-255`). Excluir música e remover pista não pedem confirmação nem oferecem Undo (`js/setlist-manager.js:131-139,334-347`; `js/mixer.js:671-699`). WebMIDI “Não Suportado” não oferece recuperação de permissão/navegador.

**Reprodução:** abra SF2 grande, negue MIDI/áudio, corrompa LocalStorage e exclua uma música por toque acidental.

**Correção:** estados loading/progress/error/empty explícitos e acessíveis; timeouts e retry; Undo para ações destrutivas; mensagens com causa e próximo passo.

### UX-015 — Falta estado de emergência e controles do teclado mentem

**Severidade: WARNING**

**Evidência:** no range padrão de 88 teclas, `startNote` é sempre 21 e ignora `baseOctave` (`js/app.js:1280-1285`), mas botões Z/X continuam habilitados (`js/app.js:1363-1407`). Espaço silencia sem indicador visual e restaura volume fixo 0.8, diferente do master inicial 0.65 (`js/app.js:1411-1416`; `js/audio-context.js:32-35`). Não há handler de `window.blur/visibilitychange` para liberar QWERTY nem botão Panic/All Notes Off.

**Reprodução:** com 88 teclas, clique Oitava+/−; segure tecla QWERTY e troque de janela; use Espaço e observe ausência de estado/volume anterior.

**Correção:** desabilitar/explicar oitava em 88 teclas ou deslocar uma janela real; guardar/restaurar volume anterior; mostrar MUTE persistente; liberar notas em blur e oferecer Panic acessível e mapeável.

### UX-016 — Copy técnica contradiz o áudio e o armazenamento

**Severidade: WARNING**

**Evidência:** UI afirma “Master Limiter … -1.0 dB” (`index.html:405-415`), mas o áudio usa compressor threshold -3 dB, ratio 4:1 (`js/audio-context.js:20-27`). A interface repete “SQLite DB”, porém o web usa LocalStorage e o Electron persiste JSON com nome `.sqlite.json` (`js/database.js:21-52`; `main.js:89-120`). O VU chamado estéreo é um único analyser/canvas por pista (`js/vu-meter.js:14-63`). A copy mistura Português, inglês e siglas em quase todos os módulos.

**Reprodução:** compare valores/tecnologia exibidos com os nós e arquivos criados.

**Correção:** usar nomes orientados a tarefa; mostrar parâmetros reais; chamar armazenamento de “Banco local” até existir SQLite; padronizar idioma e criar ajuda curta para termos MIDI/FX.

### UX-017 — Tema, cor e layout não possuem fonte única de verdade

**Severidade: WARNING**

**Evidência:** existem bons tokens em `:root` (`css/main.css:4-35`), mas 60 hex, 123 `rgb/rgba` e 222 estilos inline fixam ciano/vermelho fora dos tokens. `.mixer-channel-strip` e `.fx-*` são definidos em folhas diferentes com larguras, gaps e paddings conflitantes (`css/main.css:313-385`; `css/mixer.css:3-28`; `css/synth-rack.css:3-33`). Estados se apoiam fortemente em verde/vermelho sem padrão adicional consistente.

**Reprodução:** alterne Nord/Oberheim/Ableton e compare bordas, sombras e badges hardcoded; aumente escala de fonte do SO.

**Correção:** tokens semânticos para surface/accent/success/danger/focus, componentes sem inline style, uma definição por componente e testes de contraste/tema em estados normal/hover/focus/disabled.

### UX-018 — Offline não preserva toda a apresentação visual

**Severidade: WARNING**

**Evidência:** CSS importa Google Fonts remotamente (`css/main.css:2`) e o service worker não inclui `assets/isotipo.png`, ícones ou fontes (`sw.js:1-27`). Offline, a aplicação pode cair em fallback tipográfico e perder imagens da marca/uploader.

**Reprodução:** instalar, limpar cache HTTP fora do SW, ficar offline e recarregar.

**Correção:** hospedar fontes localmente ou aceitar/documentar stack de sistema; precache dos assets realmente usados; teste PWA offline automatizado.

## Avaliação por fluxo

| Fluxo | Estado observado | Gate |
|---|---|---|
| Carregar SF2 e listar timbres | Parsing coberto por testes; feedback de progresso ausente e nomes são interpolados em HTML. | WARNING |
| Tocar por touch/QWERTY | Pointer velocity existe; touch é minúsculo, 88-key octave não funciona e não há Panic/blur release. | BLOCKER |
| MIDI físico | Note/velocity/pitch/roteamento têm testes; Sustain/CC1 e MIDI Learn não cumprem o contrato. | BLOCKER |
| Mixer | Volume/pan diretos existem; Solo/Mute, remoção e canais ocultos quebram estado de palco. | BLOCKER |
| FX Master/por pista | Controle direto existe; persistência/recall está incorreta e potencialmente destrutiva. | BLOCKER |
| Presets | LocalStorage/JSON existem; Save conflui exportação, erros são silenciados e FX não fazem round-trip. | BLOCKER |
| Setlist | UI e snapshot existem; navegação/copy e referências ausentes produzem sucesso falso. | BLOCKER |
| Configurações | Tema/polyphony/velocity parcialmente funcionam; sample rate/buffer são placebo e saída dá sucesso falso. | BLOCKER |
| Acessibilidade | Semântica, foco, leitor de tela e teclado ausentes nos controles customizados. | BLOCKER |
| Mobile/PWA | Um breakpoint e shell offline parcial; alvos, zoom e modais não atendem uso touch. | BLOCKER |

## Plano mínimo de testes automatizados após correção

1. Round-trip de preset para todos os FX, toggles e unidades, incluindo import malformado e migração de versão.
2. Máquina de estados do mixer: Mute manual + múltiplos Solos + unsolo; remoção CH intermediário; redução/expansão de pistas sem áudio oculto.
3. WebMIDI: CC64 com notas deferidas, CC1, CC120/123 e MIDI Learn de botão disparando exatamente uma transição.
4. Setlist: atalhos documentados, limite primeiro/último, preset ausente, snapshot completo e ausência de toast de sucesso em erro.
5. Configurações: falha/sucesso de `setSinkId`, nenhum pedido de microfone no boot, e opções não suportadas desabilitadas/explicadas.
6. DOM/a11y: axe-core + navegação apenas por teclado, traps de modal, nomes acessíveis, região viva e foco visível.
7. Playwright quando disponível: 1440×900, 768×1024 e 375×812; touch targets, overflow, zoom, tema, loading/error/empty e fluxo de palco end-to-end.
8. Performance: analyser/RAF não crescem após 50 renders de mixer e pausam com página oculta.

## Pontos positivos comprovados no código

- Estrutura visual reconhecível de workstation com separação Mixer/FX/Setlist, sidebar e teclado.
- Tokens centrais de cor, tipografia e raio; quatro temas com direção estética clara.
- Empty state do SF2 é direto e acionável (`index.html:108-111`).
- Toasts, status de áudio/MIDI, velocity visualizer e VU dão uma base para feedback em tempo real.
- Inputs nativos são usados em faders/selects e o piano migrou para Pointer Events com velocity por pressão/posição.

Esses pontos sustentam a evolução do produto, mas não neutralizam os bloqueadores acima.

## Files Audited

- `index.html`
- `css/main.css`, `css/mixer.css`, `css/synth-rack.css`, `css/knob.css`
- `js/app.js`, `js/mixer.js`, `js/fx-rack.js`, `js/preset-manager.js`, `js/setlist-manager.js`
- `js/settings-modal.js`, `js/web-midi.js`, `js/midi-learn.js`, `js/knob-component.js`
- `js/velocity-visualizer.js`, `js/vu-meter.js`, `js/performance-input.js`, `js/database.js`
- Trechos de integração relevantes em `js/audio-context.js` e `js/synth-engine.js`
- `main.js`, `preload.js`, `manifest.json`, `sw.js`, `package.json`
- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`
- Planos/contexto das fases 1, 2 e 3 existentes em `.planning/phases/`

## Limitações da auditoria

- Sem screenshot/renderização, não foi possível confirmar geometria final, clipping real, contraste calculado no DOM, ordem visual, hit testing e comportamento específico de navegador.
- Sem hardware MIDI/áudio físico, os achados musicais são derivados de caminhos de código e testes automatizados; precisam de UAT humano depois das correções.
- A fase 4 não possui diretório/PLAN/SUMMARY correspondente, apesar de `ROADMAP.md` marcá-la como concluída.
