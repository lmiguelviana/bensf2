---
phase: system-wide-audit
reviewed: 2026-08-13T02:34:01Z
depth: deep
status: issues_found
files_reviewed: 37
files_reviewed_list:
  - index.html
  - main.js
  - preload.js
  - sw.js
  - manifest.json
  - twa-manifest.json
  - package.json
  - css/main.css
  - css/mixer.css
  - css/synth-rack.css
  - css/knob.css
  - js/app.js
  - js/audio-context.js
  - js/audio-worklet-processor.js
  - js/database.js
  - js/fx-rack.js
  - js/knob-component.js
  - js/midi-learn.js
  - js/mixer.js
  - js/performance-input.js
  - js/preset-manager.js
  - js/setlist-manager.js
  - js/settings-modal.js
  - js/sf2-parser.js
  - js/synth-engine.js
  - js/velocity-visualizer.js
  - js/vu-meter.js
  - js/web-midi.js
  - vst3/CMakeLists.txt
  - vst3/Source/PluginProcessor.cpp
  - vst3/Source/PluginProcessor.h
  - vst3/Source/PluginEditor.cpp
  - vst3/Source/PluginEditor.h
  - test/midi-velocity-regressions.test.js
  - test/real-sf2-fixture.test.js
  - test/sf2-regressions.test.js
  - test/state-persistence-regressions.test.js
finding_counts:
  critical: 18
  blocker: 18
  warning: 12
  info: 0
  total: 30
findings:
  critical: 18
  warning: 12
  info: 0
  total: 30
---

# Revisão sistêmica de código — BenSF2

**Veredito:** BLOCKER. A suíte automatizada passa, mas o produto ainda não está pronto para distribuição. Há falhas demonstráveis na fidelidade SF2, dinâmica, MIDI, restauração de estado, segurança do Electron, mixer, VST3, TWA e acessibilidade.

## Evidências executadas

- `npm.cmd test`: **37 aprovados, 2 ignorados, 0 falhas**. Os dois testes ignorados dependem de `BENSF2_TEST_SF2`.
- `BENSF2_TEST_SF2=C:\tmp\bensf2-generaluser-20260812\GeneralUser-GS.sf2 npm.cmd test`: **39 aprovados, 0 ignorados, 0 falhas**. Fixture: 287 presets, 920 samples, 12.618 zonas e 9.024 zonas com restrição de velocity.
- `node --check` em todos os arquivos JavaScript revisados: **sem erro de sintaxe**.
- Parse de todos os JSON revisados: **válido**.
- Sondagem adicional no fixture real: 29.630 registros `pgen/igen`, dos quais **13.155 usam operadores ignorados pelo parser atual**.
- Dimensões reais dos cinco PNG em `assets/`: **1254×1254 em todos eles**; o manifesto declara 192×192 e 512×512.
- `cmake` não está instalado neste ambiente. Mesmo assim, a configuração VST3 possui bloqueios estruturais verificáveis antes da compilação: `vst3/JUCE` não existe, não há submódulo e a lista de link contém `DEPENDS` como biblioteca.
- Não foi possível executar renderização visual automatizada, áudio audível, hardware MIDI real ou instalação Android/VST neste ambiente. Esses pontos permanecem sem validação física, e não foram tratados como aprovados.

## Bloqueadores

### CR-01 — Dados importados permitem XSS persistente e o Electron transforma isso em acesso arbitrário a arquivos

**Classificação:** BLOCKER  
**Arquivos:** `js/app.js:43-62`, `js/app.js:943-965`, `js/app.js:1494-1499`, `js/app.js:1583-1593`, `js/mixer.js:136-168`, `js/mixer.js:268-335`, `js/setlist-manager.js:273-332`, `js/settings-modal.js:153-162`, `js/settings-modal.js:197-263`, `js/preset-manager.js:123-143`, `js/preset-manager.js:363-380`, `preload.js:3-11`, `main.js:31-43`, `main.js:49-87`, `index.html:3-20`

**Problema:** nomes vindos de presets JSON, setlists/localStorage, cabeçalhos SF2, pistas e dispositivos MIDI são interpolados em `innerHTML`. Um nome como `<img src=x onerror="...">` executa código no renderer. Não há CSP. A bridge expõe `readFile(path)` e `writeFile(path, content)` para qualquer código do renderer; os handlers não validam remetente nem limitam caminhos. Navegação e criação de novas janelas não são bloqueadas, e os handlers de permissão aprovam inclusive permissões desconhecidas.

**Impacto:** abrir um preset/setlist/SF2 malicioso pode ler ou sobrescrever qualquer arquivo acessível ao usuário do sistema operacional. Uma navegação remota também pode herdar a preload privilegiada. Isso excede um XSS comum e vira comprometimento local.

**Correção:** construir todo texto não confiável com `textContent`, `createElement` e propriedades DOM; validar JSON com schema estrito; adicionar CSP sem `unsafe-inline`; bloquear `will-navigate` e usar `setWindowOpenHandler(() => ({ action: 'deny' }))`; validar `event.senderFrame.url`; remover `readFile/writeFile` genéricos e usar capacidades de uso único emitidas após diálogo nativo, com diretórios, extensões e tamanho permitidos; negar permissões por padrão. Seguir a [checklist oficial de segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security).

### CR-02 — O renderer SF2 ignora mais de 13 mil geradores do banco real e não reproduz o timbre original

**Classificação:** BLOCKER  
**Arquivos:** `js/sf2-parser.js:260-308`, `js/sf2-parser.js:315-420`, `js/synth-engine.js:447-555`

**Problema:** `parseGens()` trata apenas 11 operadores. São ignorados offsets de início/fim/loop, filtro nativo e ressonância, envelopes de volume e modulação, LFOs, sends de chorus/reverb, exclusive class, forced key/velocity e moduladores. O sintetizador substitui o envelope nativo do banco por um ADSR genérico por pista e não cria o filtro especificado pelo SF2.

**Evidência:** no GeneralUser GS usado no teste real, 13.155 de 29.630 registros geradores são descartados. Entre os mais frequentes estão `initialFilterFc`, `attackVolEnv`, `decayVolEnv`, `releaseVolEnv`, `modEnvToFilterFc`, offsets de sample/loop e sends. O teste real atual confirma apenas estrutura, escolha de IDs e relação de ganho; ele não compara o PCM renderizado com um sintetizador de referência.

**Impacto:** instrumentos podem ter ataque, cauda, brilho, loop, estéreo, articulação e balanceamento diferentes do banco original. Esse é o principal motivo comprovado para a amostra soar “artificial” ou “não real”.

**Correção:** implementar os geradores relevantes da especificação, com combinação correta de zonas global/local e conversões de timecents/absolute cents; aplicar offsets antes de criar o `AudioBufferSourceNode`; criar envelope e filtro por voz; suportar exclusive class e moduladores. Adicionar testes golden/diferenciais contra FluidSynth para notas e velocities representativas. Referência: [SoundFont 2.04 Specification](https://www.synthfont.com/sfspec24.pdf).

### CR-03 — A atenuação SF2 é reduzida indevidamente a 40%, elevando camadas em até dezenas de dB

**Classificação:** BLOCKER  
**Arquivos:** `js/sf2-parser.js:283-285`, `js/sf2-parser.js:386-415`, `js/synth-engine.js:507-512`, `test/sf2-regressions.test.js:369-423`

**Problema:** o parser soma `initialAttenuation` em centibels e depois executa `Math.floor(rawAttenuation * 0.4)`. A especificação já define o valor em centibels; o sintetizador depois usa corretamente `10^(-cB/200)`. O fator `0.4` comprime a dinâmica e deixa as zonas muito mais altas.

**Reprodução:** o próprio teste monta uma atenuação final de 400 cB. O resultado correto é -40 dB (`gain=0,01`); o código converte para 160 cB, ou -16 dB (`gain≈0,1585`), **24 dB mais alto**. O teste espera 160 e, portanto, protege o defeito em vez de detectá-lo.

**Impacto:** camadas que deveriam ficar ao fundo dominam a mix, somam com outras zonas, comprimem a diferença entre toque fraco e forte e favorecem clipping/distorção.

**Correção:** remover o fator `0.4`, manter centibels durante todo o pipeline e aplicar a conversão linear uma única vez. Atualizar o teste para esperar 400 e acrescentar casos de 0, 60 e 400 cB com tolerância numérica baseada na especificação.

### CR-04 — A polifonia declarada não é um limite: uma nota multicamada ultrapassa o teto e o contador cresce

**Classificação:** BLOCKER  
**Arquivo:** `js/synth-engine.js:428-435`, `js/synth-engine.js:447-555`

**Problema:** o engine rouba no máximo uma voz antes de iterar `matchingZones`. Uma única nota pode criar duas ou mais vozes estéreo/multicamadas depois dessa verificação. Com limite 64 e quatro zonas, o mapa pode terminar com 67 vozes; cada nota seguinte remove uma e adiciona quatro, aumentando mais três.

**Impacto:** o controle de polifonia não protege o áudio. Bancos densos podem somar ganho além do esperado, provocar estalos e fazer o sistema degradar em apresentação ao vivo.

**Correção:** contar apenas zonas com sample decodificado e executar `while (activeVoices.size + voicesToCreate > maxPolyphony)` antes de criar as fontes, ou verificar/roubar dentro da criação de cada voz. Adicionar teste com limite pequeno e preset de 2–4 zonas, afirmando `activeVoices.size <= maxPolyphony` após cada nota.

### CR-05 — CC64 e CC1 aparecem como suportados, mas não alteram o som corretamente

**Classificação:** BLOCKER  
**Arquivos:** `js/web-midi.js:237-262`, `js/web-midi.js:15`, `js/app.js:89-120`, `js/synth-engine.js:560-590`, `index.html:460`

**Problema:** CC64 apenas muda `sustainPedalActive`; nenhum `noteOff` consulta essa flag e não existe fila de notas sustentadas. CC1 físico não tem branch no MIDI. A roda gráfica chamada “Modulation Wheel (CC1)” controla apenas o reverb da pista selecionada, não modulação do sintetizador.

**Reprodução:** enviar Note On, CC64=127, Note Off: a voz entra em release imediatamente. Enviar CC1 em qualquer valor: nenhum método de synth/FX é chamado, salvo se o usuário tiver criado manualmente um MIDI Learn global para aquele CC.

**Impacto:** pedal e roda de modulação, controles fundamentais em piano/teclado, falham durante performance.

**Correção:** manter sustain por dispositivo e canal MIDI, adiar `noteOff` enquanto o pedal estiver ativo e liberar apenas as notas pendentes na transição para CC64<64. Implementar CC1 como fonte de modulação por canal e definir claramente seus destinos. Cobrir pedal, repedal, troca de canal/dispositivo e CC1 em testes.

### CR-06 — Dois controladores tocando a mesma nota/canal encerram a voz um do outro

**Classificação:** BLOCKER  
**Arquivos:** `js/web-midi.js:169-188`, `js/web-midi.js:191-235`, `js/synth-engine.js:376-380`, `js/synth-engine.js:428-430`, `js/synth-engine.js:531-579`

**Problema:** `WebMidiManager` identifica a rota por dispositivo, mas chama o sintetizador sem o `deviceId`. O synth identifica a voz somente por pista/canal/nota e encerra a voz anterior com `stopVoicesForNote()`. Assim, Note On do dispositivo B mata A; depois o Note Off de A libera a voz nova de B. Mapeamentos MIDI Learn também são indexados apenas por número de CC, não por dispositivo/canal.

**Impacto:** o recurso de múltiplos controladores não é isolado e falha justamente quando os músicos coincidem em uma nota.

**Correção:** propagar um `ownerId` estável (`deviceId + canal + note instance`) até cada voz e exigir o mesmo owner no Note Off/voice replacement. Indexar CC Learn por escopo configurável (dispositivo/canal/CC). Adicionar regressão com dois dispositivos, mesma nota e mesmo canal, soltando-os em ordens diferentes.

### CR-07 — Solo destrói o estado de Mute e deixa pistas permanentemente silenciadas

**Classificação:** BLOCKER  
**Arquivo:** `js/mixer.js:603-619`, `js/mixer.js:639-662`, `js/synth-engine.js:683-688`

**Problema:** ao ativar Solo, `handleSoloToggle()` chama `setChannelMute()` nas outras pistas, sobrescrevendo a propriedade persistente `muted`. Ao remover o último Solo, o código lê o valor já sobrescrito e mantém as pistas silenciadas.

**Reprodução:** CH1 e CH2 sem mute; ativar Solo em CH1; desativar Solo. CH2 continua com `muted=true` e ganho zero.

**Correção:** separar `userMuted` de `soloSuppressed`, calcular o ganho efetivo sem alterar a intenção do usuário e atualizar os botões a partir do estado derivado. Cobrir mute prévio, múltiplos solos e ida/volta em teste.

### CR-08 — Ocultar ou remover uma pista não remove a pista escolhida e pode deixá-la tocando invisível

**Classificação:** BLOCKER  
**Arquivos:** `js/mixer.js:67-70`, `js/mixer.js:97-113`, `js/mixer.js:671-699`, `js/synth-engine.js:342-360`, `js/synth-engine.js:410-417`

**Problema:** reduzir `totalChannels` só redesenha o DOM; canais 1–16 continuam roteados e tocando. `removeChannel(ch)` zera o ganho da pista clicada, reduz o total e redesenha os canais 1..N, sem deslocar/remover o estado. Remover CH2 de quatro pistas deixa CH2 visível porém mudo e CH4 oculto porém ainda roteável.

**Impacto:** o som ouvido não corresponde ao mixer mostrado, e a operação destrói a previsibilidade do projeto ao vivo.

**Correção:** modelar pistas ativas por IDs estáveis em uma coleção, não por mera contagem visual; ao remover, parar vozes, desconectar nós, excluir estado/FX/VU/bindings e selecionar uma pista válida. Se a intenção for apenas ocultar, oferecer ação distinta e manter indicador explícito de áudio ativo.

### CR-09 — MIDI Learn em Mute/Solo executa dois cliques e termina sem alterar nada

**Classificação:** BLOCKER  
**Arquivos:** `js/midi-learn.js:142-180`, `js/midi-learn.js:196-210`, `js/mixer.js:621-633`, `js/mixer.js:97-113`

**Problema:** o dispatcher de MIDI Learn já chama `targetElement.click()` para botões e depois chama `targetCallback()`. Os callbacks de Mute e Solo chamam `.click()` novamente; o estado alterna duas vezes e volta ao valor inicial. Além disso, a chave de controles sem ID inclui `className`; depois de adicionar `midi-linked`, a chave muda, e cada rerender do mixer destrói o elemento ao qual o binding antigo aponta.

**Correção:** cada binding deve ter uma única função de atualização; para botão, ou o dispatcher clica ou o callback altera estado, nunca ambos. Usar IDs lógicos estáveis (`trackId/control`) e reanexar bindings após render, sem armazenar referência DOM obsoleta. Testar CC baixo/alto, rerender e remoção do vínculo.

### CR-10 — Salvar/carregar preset corrompe unidades de FX e perde estados inteiros

**Classificação:** BLOCKER  
**Arquivos:** `js/preset-manager.js:18-74`, `js/preset-manager.js:162-251`, `js/fx-rack.js:33-49`, `js/fx-rack.js:168-198`, `js/fx-rack.js:339-377`, `js/synth-engine.js:669-680`

**Problema:** o preset procura `fxRack.trackParams`, mas o estado real está em `channelFx: Map`; por isso FX por pista são salvos como `{}` e nunca restaurados. O snapshot de master copia percentuais (30, 20, 40, 25), mas o loader os entrega a setters que esperam valores normalizados 0..1. Também não salva os quatro flags `master*Enabled`. Valores importados não têm schema nem limites antes de chegar a AudioParams.

**Reprodução:** salvar o padrão `reverbSize=40` e recarregar chama `setMasterReverbSize(40)`, que cria duração aproximada de 141,75 s e grava 4000%. Mix de chorus 30 pode virar ganho 30 quando habilitado. Cada ciclo de save/load escala novamente alguns parâmetros.

**Impacto:** congelamento durante criação de impulse response, volumes extremos/distorção e perda silenciosa do som configurado.

**Correção:** criar schema versionado com unidade canônica explícita; serializar `channelFx.get(ch).params` e todos os flags master; validar ranges/tipos antes de aplicar; restaurar exclusivamente por setters públicos normalizados; testar round-trip byte-a-byte do estado e comportamento dos AudioParams, incluindo importação hostil.

### CR-11 — Snapshot de Setlist não é completo, aponta para índices frágeis e confirma sucesso mesmo sem trocar o som

**Classificação:** BLOCKER  
**Arquivo:** `js/setlist-manager.js:24-31`, `js/setlist-manager.js:38-82`, `js/setlist-manager.js:142-190`, `js/setlist-manager.js:197-228`, `index.html:693-700`

**Problema:** o snapshot promete “todas as pistas, timbres e efeitos”, mas omite ADSR, FX por pista, flags/master completo e identidade estável do timbre. Salva somente `assignedPresetIndex`, que muda conforme bancos são recarregados. Lê propriedades inexistentes na raiz de `fxRack` e restaura `reverbMix` com o setter de pista, não o master. Se o preset vinculado não existir, `selectSong()` não aplica nada e ainda mostra toast de sucesso. Os três itens demo já referenciam presets inexistentes e são persistidos automaticamente.

**Impacto:** mudança de música em show pode produzir som antigo, silêncio ou timbre errado enquanto a interface informa sucesso.

**Correção:** reutilizar um único schema validado de rig/preset, com fingerprint do arquivo SF2 + bank + program + nome, FX e ADSR completos. Fazer `applySnapshot()` retornar resultado transacional; somente marcar a música ativa após validação/aplicação, e mostrar erro acionável quando recursos faltarem. Remover demos persistentes ou marcá-los inequivocamente como tutorial.

### CR-12 — Configurações de sample rate e buffer são placebo; troca de saída pode falhar e ainda confirma sucesso

**Classificação:** BLOCKER  
**Arquivos:** `index.html:526-548`, `js/settings-modal.js:25-35`, `js/settings-modal.js:68-89`, `js/settings-modal.js:117-165`, `js/settings-modal.js:315-363`, `main.js:31-43`

**Problema:** os selects `sampleRateSelect` e `bufferSizeSelect` são capturados no `init()`, mas nunca lidos nem aplicados. `applySettings()` dispara `_switchAudioOutput()` sem `await`, fecha o modal e alerta sucesso mesmo quando `setSinkId()` falha ou não existe. A enumeração pede acesso ao microfone já na inicialização do app; no Electron, o handler aprova automaticamente qualquer permissão.

**Impacto:** o usuário acredita ter configurado latência/dispositivo quando nada mudou, e o app solicita/captura permissão de microfone sem uma ação contextual explícita.

**Correção:** remover opções que a plataforma não consegue honrar ou recriar o `AudioContext` antes do uso com `sampleRate` e `latencyHint` documentados; aguardar a troca de sink e só confirmar após sucesso; manter o modal aberto em erro. Solicitar mídia somente após gesto e explicação do usuário, e negar permissões não listadas.

### CR-13 — O VST3 não é compilável nem funcional: produz silêncio, depende de localhost e não salva estado

**Classificação:** BLOCKER  
**Arquivos:** `vst3/CMakeLists.txt:10-12`, `vst3/CMakeLists.txt:38-43`, `vst3/Source/PluginProcessor.cpp:91-116`, `vst3/Source/PluginProcessor.cpp:128-134`, `vst3/Source/PluginEditor.cpp:4-12`, `package.json:32-47`

**Problema:** `add_subdirectory(JUCE)` aponta para um diretório ausente e não há submódulo; `DEPENDS` foi colocado dentro de `target_link_libraries`. O processador de synth ignora `midiMessages` e, com zero entradas, limpa todos os canais de saída. O editor abre `http://127.0.0.1:8080/index.html`, mas o plugin não inicia nem incorpora servidor. State save/load são vazios. O empacotamento Electron não inclui `vst3/` nem um binário construído.

**Impacto:** mesmo superando a configuração, o plugin abre vazio e emite silêncio; projetos da DAW não recuperam estado.

**Correção:** escolher arquitetura real: sintetizador JUCE nativo ou bridge de áudio/MIDI testável, nunca um localhost externo. Adicionar JUCE por submódulo/FetchContent fixado, corrigir CMake, processar MIDI e áudio no realtime thread, persistir estado (por exemplo APVTS), embutir recursos da UI e empacotar o `.vst3`. Criar CI que configure, compile, rode pluginval e faça smoke test de Note On→áudio não zero.

### CR-14 — O repositório não contém um TWA/Android publicável apesar de declarar entrega Play Store

**Classificação:** BLOCKER  
**Arquivos:** `twa-manifest.json:1-28`, `manifest.json:1-21`, `package.json:1-62`

**Problema:** existe apenas um arquivo de configuração Bubblewrap. Não há projeto Gradle/Android, wrapper, AAB/APK, configuração de assinatura nem `.well-known/assetlinks.json`; `iconUrl` e `webManifestUrl` são relativos. Sem Digital Asset Links verificado, uma TWA cai para Custom Tab, e sem AAB assinado não há artefato para upload.

**Correção:** gerar e versionar o projeto Bubblewrap, usar URLs HTTPS absolutas, publicar `assetlinks.json` com o fingerprint real, construir AAB assinado em CI e instalar/testar em dispositivo limpo. A exigência de associação é documentada no [quick start oficial de Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start).

### CR-15 — Controles essenciais não são operáveis por teclado/leitor de tela e o layout mobile inviabiliza interação precisa

**Classificação:** BLOCKER  
**Arquivos:** `index.html:5`, `index.html:540-636`, `index.html:640-718`, `js/app.js:1280-1352`, `js/knob-component.js:25-40`, `js/knob-component.js:70-119`, `css/main.css:37-54`, `css/main.css:877-930`, `css/main.css:949-967`, `css/knob.css:3-33`

**Problema:** não há nenhuma ocorrência de `aria-*`, `role`, `tabindex` ou `:focus-visible`. Teclas do piano e knobs são `div`s acionáveis apenas por pointer; não há valor/nome acessível nem teclado. O viewport proíbe zoom, o body bloqueia seleção/overflow, as teclas chegam a 8 px/5 px e modais inline têm 400–440 px sem `max-width`. Há apenas um breakpoint superficial.

**Impacto:** usuários de teclado/tecnologia assistiva não conseguem operar partes centrais; em telas pequenas, alvos e modais podem ficar inacessíveis. Isso contradiz o alvo desktop/mobile do produto.

**Correção:** usar elementos semânticos (`button`, `input[type=range]`) ou implementar o padrão ARIA completo, foco visível e teclas Enter/Space/setas; anunciar status em `aria-live`; associar labels; permitir zoom; aplicar alvos mínimos e modais responsivos; definir layout mobile por fluxo real e testar navegação inteira somente com teclado e leitor de tela.

### CR-16 — Pitch Bend de um canal MIDI desafina vozes de outros canais em pistas configuradas como “todos”

**Classificação:** BLOCKER  
**Arquivo:** `js/synth-engine.js:320-367`, `js/synth-engine.js:495-505`, `js/synth-engine.js:533-549`

**Problema:** `getTracksForMidiChannel()` inclui toda pista com `assignedMidiChannel='all'`; `setMidiPitchBend()` converte o evento em bend por pista; `setPitchBend()` então altera todas as vozes daquela pista, embora cada voz já registre `inputMidiChannel`. O estado de bend usado por notas futuras também fica na pista, não no canal/origem MIDI.

**Reprodução:** deixar CH1 em “TODOS”, sustentar C4 vindo dos canais MIDI 1 e 2 e enviar pitch bend somente no canal 1. As duas vozes mudam de afinação; uma nova nota no canal 2 também nasce com o bend do canal 1.

**Impacto:** splits/layers omni e múltiplos teclados não preservam expressão por canal e desafinam notas que não receberam bend.

**Correção:** armazenar bend por origem/canal MIDI e aplicá-lo somente a vozes com o mesmo `inputMidiChannel`/`deviceId`; manter uma API separada para bend direto de pista/tela. Testar duas notas simultâneas em canais diferentes na mesma pista omni.

### CR-17 — Mover o fader ou receber CC7 torna audível uma pista que continua marcada como Mute

**Classificação:** BLOCKER  
**Arquivos:** `js/synth-engine.js:669-688`, `js/web-midi.js:254-260`, `js/mixer.js:406-423`

**Problema:** `setChannelMute()` zera o `GainNode`, porém `setChannelVolume()` sempre escreve o volume novo no mesmo nó sem consultar `muted`. O fader e CC7 chamam esse setter. A propriedade e o botão continuam marcados como mute enquanto vozes já sustentadas voltam a soar.

**Reprodução:** sustentar uma nota, ativar Mute e mover o fader ou enviar CC7>0. O ganho da pista volta acima de zero, embora `channels[ch].muted === true`.

**Correção:** armazenar o volume solicitado, mas aplicar ao nó o ganho efetivo `muted || soloSuppressed ? 0 : volume`. Centralizar toda recomputação de ganho de pista e testar fader/CC7 durante mute e solo.

### CR-18 — Retrigger e voice stealing cortam a waveform instantaneamente e geram cliques

**Classificação:** BLOCKER  
**Arquivo:** `js/synth-engine.js:376-381`, `js/synth-engine.js:428-435`, `js/synth-engine.js:634-665`

**Problema:** repetir a mesma nota, exceder polifonia ou chamar stop global usa `stopVoiceImmediate()`, que executa `source.stop()` e desconecta sem qualquer rampa. Quase todo corte ocorre fora do zero crossing e cria uma descontinuidade audível.

**Impacto:** ataques rápidos e voice stealing produzem estalos que podem ser percebidos como amostra distorcida, justamente sob execução forte/densa.

**Correção:** aplicar fade sample-accurate curto (por exemplo 2–5 ms) no `gainNode`, agendar `source.stop(now + fade)` e só então limpar; preservar o limite contando vozes em fade ou reservando slots. Adicionar teste OfflineAudioContext que mede a maior descontinuidade em retrigger/steal.

## Avisos

### WR-01 — “Bater forte na tela” só funciona como pressão em hardware que realmente informa `PointerEvent.pressure`

**Classificação:** WARNING  
**Arquivos:** `js/performance-input.js:11-30`, `js/app.js:1323-1340`, `test/midi-velocity-regressions.test.js:328-352`

**Problema:** muitos touchscreens retornam pressão fixa `0.5`. O código detecta isso e usa a posição vertical da tecla; dois toques fraco/forte no mesmo ponto produzem a mesma velocity. O teste confirma explicitamente posição, não força física. Em contrapartida, o caminho MIDI físico preserva corretamente o byte de velocity 1..127.

**Correção:** comunicar na UI que o fallback é “posição na tecla”; oferecer modo/calibração de velocity e, onde houver dados, combinar pressão, área de contato e dinâmica do gesto. Fazer teste de dispositivo real por classe de hardware, sem prometer sensibilidade à força em telas que não a suportam.

### WR-02 — A UI promete limiter de -1 dB, mas existe apenas um compressor 4:1 com threshold -3 dB

**Classificação:** WARNING  
**Arquivos:** `index.html:405-416`, `js/audio-context.js:20-38`

**Problema:** `DynamicsCompressorNode` com ratio 4:1, knee 6 e threshold -3 não impõe teto hard em -1 dB e não é true-peak. Vozes/FX somados podem ultrapassar 0 dBFS antes/na saída; a mensagem de proteção absoluta é falsa.

**Correção:** ou corrigir o texto para “compressor”, ou implementar limiter/clipper com teto mensurável e oversampling. Adicionar teste offline com pior caso polifônico e afirmar peak/true-peak máximo.

### WR-03 — AudioWorklet anunciado como baixa latência está desconectado e contém defeitos de DSP

**Classificação:** WARNING  
**Arquivo:** `js/audio-worklet-processor.js:1-123`

**Problema:** nenhum arquivo chama `audioWorklet.addModule()` ou cria `AudioWorkletNode`; portanto o módulo nunca roda. Se for ativado, o loop só volta quando chega ao fim total, ignorando `loopEnd`; saída mono usa o mesmo array para esquerda/direita e soma a amostra duas vezes; vozes sem buffer permanecem para sempre.

**Correção:** remover o módulo e alegações até estar pronto, ou integrá-lo com protocolo versionado, loop correto, canais separados e limpeza de voz. Criar testes OfflineAudioContext/golden para mono, estéreo, loop, release e pitch.

### WR-04 — Persistência assíncrona e falhas de storage são ocultadas enquanto a UI informa sucesso

**Classificação:** WARNING  
**Arquivos:** `js/database.js:6-45`, `js/database.js:47-82`, `js/app.js:943-967`, `js/preset-manager.js:77-120`, `js/preset-manager.js:385-400`

**Problema:** o construtor do banco dispara `init()` sem expor/aguardar a Promise, enquanto a UI usa timeout arbitrário de 200 ms. Retorno `false` do IPC de gravação é ignorado. Preset engole exceções de localStorage, mostra sucesso e sempre abre também exportação de arquivo. Dados persistidos não são validados como arrays/schema.

**Correção:** expor `ready`, aguardar antes de renderizar, propagar falhas e só confirmar após persistência; separar “salvar no app” de “exportar arquivo”; validar/migrar todo estado carregado e tornar gravação atômica.

### WR-05 — Há caminhos para notas presas e comandos do teclado contraditórios

**Classificação:** WARNING  
**Arquivos:** `js/app.js:1280-1285`, `js/app.js:1363-1436`, `js/app.js:1466-1474`, `index.html:433-434`, `js/web-midi.js:237-274`

**Problema:** QWERTY não libera notas em `blur`/`visibilitychange`; não há tratamento de CC120/CC123 nem botão Panic. No modo 88 teclas, os botões de oitava continuam mudando `baseOctave`, mas o teclado começa sempre na nota 21. Space desmuta para 0,8, embora o master inicial seja 0,65 e possa ter outro valor. A UI diz Anterior `(N)` e Próxima `(M)`, mas o código usa P para anterior e N para próxima.

**Correção:** centralizar `allNotesOff()` e chamá-lo em blur, ocultação, desconexão e CC120/123; adicionar Panic visível; desabilitar oitava em 88 teclas; restaurar o volume anterior; alinhar atalhos e cobertura automatizada.

### WR-06 — PWA offline e ícones não correspondem ao manifesto

**Classificação:** WARNING  
**Arquivos:** `manifest.json:4-14`, `sw.js:1-27`, `css/main.css:1-2`

**Problema:** os arquivos declarados como 192×192 e 512×512 têm 1254×1254 idênticos. O app shell não pré-cacheia nenhum ícone/logo, e as fontes são carregadas remotamente do Google sem cache controlado. Não há fallback explícito para navegação offline.

**Correção:** gerar ícones reais nos tamanhos declarados, incluindo variante maskable; cachear assets próprios e fontes hospedadas localmente; implementar fallback de navegação e validar instalação/offline com Lighthouse e dispositivo limpo.

### WR-07 — A suíte verde mascara falhas centrais e um teste codifica o cálculo SF2 errado

**Classificação:** WARNING  
**Arquivos:** `test/sf2-regressions.test.js:369-423`, `test/real-sf2-fixture.test.js:38-178`, `test/state-persistence-regressions.test.js:48-126`, `test/midi-velocity-regressions.test.js:1-359`

**Problema:** o teste de atenuação exige o valor incorreto 160. Os testes de state usam setters vazios e depois verificam propriedades que já tinham o valor esperado, então não detectam remoção de chamadas de volume/pan/mute/preset. O fixture real é opcional e valida estrutura, não fidelidade PCM. Não há teste de sustain/CC1, colisão entre dispositivos, Solo, remoção de pista, FX/preset round-trip, Setlist completo, Settings, XSS/IPC, browser/Electron, PWA/TWA ou VST.

**Correção:** tornar um fixture licenciado/checksummed obrigatório em CI; comparar renders golden com implementação de referência; substituir mocks no-op por spies e AudioParam fakes verificáveis; adicionar testes DOM/integrados e matrizes de build/smoke para Electron, VST3 e Android.

### WR-08 — Knobs ignoram steps fracionários e o gesto touch pode rolar a página

**Classificação:** WARNING  
**Arquivos:** `js/knob-component.js:62-89`, `js/knob-component.js:99-118`, `css/knob.css:3-33`

**Problema:** snapping só ocorre quando `step >= 1`; controles com step 0,5 produzem valores arbitrários. Listeners touch são passivos e não impedem scroll; cada instância registra listeners globais sem método de descarte.

**Correção:** aplicar snapping para qualquer step positivo em relação a `min`; migrar para Pointer Events com capture e `touch-action:none`; adicionar `dispose()` para listeners; cobrir mouse, touch, caneta, wheel e teclado.

### WR-09 — Remapear MIDI Learn deixa callbacks fantasmas e pode apagar o vínculo de outro controle

**Classificação:** WARNING  
**Arquivo:** `js/midi-learn.js:142-177`, `js/midi-learn.js:196-210`, `js/web-midi.js:169-175`

**Problema:** ao mover um elemento de CC10 para CC11, `completeLearning()` remove CC11, não o CC anterior guardado no binding; o callback de CC10 continua ativo. Ao reutilizar um CC em outro elemento, o binding antigo permanece no mapa de UI e, se removido depois, apaga o callback do dono novo.

**Correção:** manter índices consistentes elemento→binding e CC→binding; remover atomicamente tanto o CC anterior do elemento quanto o dono anterior do CC novo; usar chave lógica imutável e testar todas as combinações de remapeamento.

### WR-10 — A UI oferece ADSR que o motor substitui silenciosamente por mínimos diferentes

**Classificação:** WARNING  
**Arquivos:** `js/app.js:487-568`, `js/synth-engine.js:474-478`, `js/synth-engine.js:601-629`

**Problema:** a UI oferece Attack de 1 ms, Decay de 10 ms e Release de 10 ms. Na reprodução, o engine força respectivamente pelo menos 8 ms, 50 ms e 20 ms; para release igual a zero, `adsr.release || 0.25` transforma o valor em 250 ms. O valor mostrado não é o valor ouvido.

**Correção:** alinhar limites entre UI, schema e engine; tratar zero com `??`, não `||`; ou aceitar os valores oferecidos com rampas seguras. Testar os valores mínimo, zero, padrão e máximo inspecionando os tempos agendados.

### WR-11 — SoundFont 2.04 de 24 bits perde os oito bits baixos sem aviso

**Classificação:** WARNING  
**Arquivo:** `js/sf2-parser.js:133-145`

**Problema:** o parser lê apenas o chunk `smpl` como `Int16Array` e ignora `sm24`. Bancos SF2 2.04 com extensão de 24 bits são reproduzidos com resolução reduzida, embora a UI os aceite como SF2 normal.

**Correção:** combinar `smpl` e `sm24` em PCM de 24 bits normalizado, ou detectar o chunk e avisar/rejeitar explicitamente até haver suporte. Adicionar fixture mínima de 24 bits e comparação de amostras.

### WR-12 — O VU chamado de estéreo mede e desenha apenas um valor por pista

**Classificação:** WARNING  
**Arquivos:** `js/vu-meter.js:14-63`, `js/mixer.js:97-113`

**Problema:** cada pista recebe um único `AnalyserNode`, uma única leitura temporal e uma única barra. Não há `ChannelSplitterNode`, medição L/R nem peak hold. Além disso, cada rerender conecta outro analyser ao nó e sobrescreve apenas a referência no mapa, sem desconectar o anterior.

**Correção:** separar L/R, desenhar dois medidores e adicionar descarte/desconexão antes de recriar a UI. Testar sinais exclusivamente à esquerda/direita e vários rerenders sem aumento de conexões.

## Ordem recomendada de correção

1. Fechar a cadeia XSS/IPC/permissões antes de distribuir qualquer build Electron.
2. Corrigir atenuação e completar o renderer SF2; validar por comparação auditiva/PCM com FluidSynth.
3. Corrigir polifonia, sustain/CC1, identidade por dispositivo, Solo e ciclo de pistas.
4. Unificar schema transacional de Preset/Setlist/FX e tornar Settings verificável.
5. Decidir se VST3 e TWA serão entregues de verdade ou removidos das promessas até haver artefatos testados.
6. Fechar acessibilidade/mobile e depois ampliar a automação E2E/hardware/build.

---

_Revisado: 2026-08-13T02:34:01Z_  
_Revisor: Codex — revisão adversarial sistêmica_  
_Profundidade: deep_
