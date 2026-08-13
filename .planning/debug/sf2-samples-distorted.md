---
status: awaiting_human_verify
trigger: "analise o sistema, pesquise no github pq o sistmea ta distorcendo as amostrar e não ta vindo real, e converte tem o gsd se auiser contudo do sistema"
created: 2026-08-12T20:00:24.2425825-03:00
updated: 2026-08-12T22:49:00-03:00
---

## Current Focus

hypothesis: confirmed and fixed — sample identities now reserve header cardinality, natural source endings own idempotent cleanup, and traversal is bounded by declared RIFF/LIST parents
test: automated verification is complete — npm.cmd test passed 19/19, followed by 20/20 repeated runs, public fixture invariants, syntax, and diff checks
expecting: human browser/Electron audition confirms the original real-workflow distortion symptom is resolved with multi-bank loading and naturally ending one-shots
next_action: root reviews the final diff and performs human audition; keep this session open and do not commit, push, archive, or mark resolved until confirmation
reasoning_checkpoint:
  hypothesis: "Three direct ownership/boundary violations cause the findings: loadSoundFont derives identity allocation from successfully decoded buffers instead of input header cardinality; voices have no natural-end cleanup path; parser traversal accepts declared RIFF/LIST sizes without proving headers and payloads fit their parent bounds."
  confirming_evidence:
    - "After bank A contributes one invalid header and no buffer, bank B is directly observed at keys [0,1], so preset A sampleIndex 0 aliases bank B."
    - "A created one-shot directly exposes onended=null; the only cleanup entry point calls stop and therefore cannot represent natural completion."
    - "A four-byte RIFF input directly throws DataView RangeError, and every traversal offset is currently computed from unchecked declared sizes."
  falsification_test: "The hypotheses are false if reserving by header cardinality does not isolate bank A, if invoking an onended cleanup still retains the exact voice/nodes or calls stop, or if parent-bounded header/payload validation does not normalize all six malformed structures."
  fix_rationale: "Persisting a monotonically increasing next sample index reserves identity even for silent samples; separating idempotent resource cleanup from optional source stopping matches both explicit and natural lifecycles; checking every header/payload against its RIFF/LIST parent prevents out-of-bounds reads at the source."
  blind_spots: "The harness cannot simulate browser event scheduling races beyond repeated/idempotent callback invocation; valid files with trailing bytes outside declared RIFF size are intentionally treated according to the RIFF container boundary rather than parsed."
tdd_checkpoint:
  test_file: "test/sf2-regressions.test.js"
  test_name: "multi-bank namespace, natural-end cleanup, and malformed RIFF/LIST bounds regressions"
  status: "green"
  failure_output: "RED was 19 tests: 16 pass/3 focused failures; each focused regression now passes independently after its proportional implementation fix."

## Symptoms

expected: arquivos SF2 devem preservar o timbre, a afinação, a dinâmica, os loops e a imagem estéreo originais
actual: as amostras soam distorcidas e artificiais, mesmo após as duas correções mais recentes do motor SF2
errors: nenhum erro de execução foi informado; a falha é perceptiva e funcional no áudio renderizado
reproduction: carregar um arquivo SF2 ou SF3, selecionar um preset e tocar notas em diferentes regiões e velocidades
started: presente no build atual; os commits 4947ddc e 35d85ad tentaram corrigir distorção e afinação sem eliminar o sintoma

## Eliminated

## Evidence

- timestamp: 2026-08-12T20:12:17.3280436-03:00
  source: parser/UI current behavior and commit history around 1db477f
  observation: the UI accepts .sf3 while compressed Ogg/Vorbis smpl data is decoded as Int16 PCM; no Vorbis decoder is present
  implication: add a regression and either implement real decoding or reject/remove SF3 explicitly so compressed bytes can never be emitted as noise
- timestamp: 2026-08-12T20:11:17.6616665-03:00
  source: SF2 shdr specification and SpessaSynth sample-header handling
  observation: originalPitch is valid across MIDI keys 0..127 and only values above 127 require fallback; BenSF2 narrows this to 12..108 and replaces valid extremes with 60
  implication: samples rooted at 0 or 127, common in percussion/FX, can be transposed by many octaves; add boundary regressions and restore the specified domain
- timestamp: 2026-08-12T20:09:49.3125312-03:00
  source: SpessaSynth basic_preset.ts:284-311, TinySoundFont tsf.h:844-862/1637 e SoundFont-Spec-Test README teste 11
  observation: geradores globais são sobrescritos pelos locais em cada nível antes da soma preset+instrument; BenSF2 soma instGlobal+iGen e pode duplicar um gerador. A correção EMU converte 1 dB declarado em 0,4 dB efetivo. TinySoundFont confirma zonas globais e loop somente quando loop_mode não é none
  implication: testar precedência global/local, interseção de ranges, escala de initialAttenuation e sampleModes; corrigir somente após confirmar cada divergência no harness

- timestamp: 2026-08-12T20:04:45.3076803-03:00
  source: comparação local com C:\tmp\bensf2_reference_fluidsynth_20260812
  observation: FluidSynth habilita loop pelos sampleModes e rejeita/desliga loops curtos ou inválidos; BenSF2 usa sampleObj.hasLoop como condição alternativa e pode forçar loop em zona unlooped
  implication: criar regressão em que sampleModes=0 e cabeçalho contenha pontos de loop; o voice não deve repetir
- timestamp: 2026-08-12T20:04:45.3076803-03:00
  source: comparação local entre FluidSynth, SpessaSynth e BenSF2
  observation: a diferença textual do sinal de pitchCorrection não prova bug porque as fórmulas usam grandezas inversas; o problema confirmado é o recálculo de pitch bend descartar coarse/fine tune e pitchCorrection
  implication: derivar a taxa final antes de alterar pitchCorrection e criar regressão de pitch bend preservando todos os termos de afinação
- timestamp: 2026-08-12T20:04:45.3076803-03:00
  source: fixture pública mrbumpy409/SoundFont-Spec-Test em C:\tmp\bensf2_sf_spec_test_20260812\sf_spec_test.sf2
  observation: o SoundFont contém 22 testes de conformidade, incluindo root key, attenuation, velocity, sample offset, pitch bend, panning e estéreo
  implication: usar a fixture para reproduzir o parser com um SF2 real e ampliar a cobertura sem depender de arquivo do usuário
- timestamp: 2026-08-12T20:07:50.8407311-03:00
  source: inspeção operacional do service worker
  observation: sw.js usa cache estático v1 com estratégia cache-first e a versão não foi atualizada durante correções recentes de parser e sintetizador
  implication: uma PWA instalada pode continuar executando JavaScript antigo; avaliar bump/invalidação do cache e cobrir a política do service worker em teste, ou documentar explicitamente por que ficaria fora do escopo

- timestamp: 2026-08-12T20:24:00-03:00
  source: algebraic derivation from BenSF2, SpessaSynth CachedVoice/renderVoice, and FluidSynth fluid_voice/fluid_rvoice
  observation: all three imply rate = 2^(((note-rootKey+coarseTune+bend)*100 + fineTune + pitchCorrection)/1200); FluidSynth subtracts pitchadj in rootPitch then divides by it, making pitchadj positive in the effective rate
  implication: the existing positive pitchCorrection sign in noteOn is correct and must not be inverted
- timestamp: 2026-08-12T20:24:00-03:00
  source: isolated SynthEngine harness with coarseTune=1, fineTune=25, pitchCorrection=50 cents, and bend=+2
  observation: initial playbackRate was correct at 1.1063695329, but after bend it was 1.1224620483 rather than 1.2418578121; observed ratio was 1.0145453349 instead of 1.1224620483
  implication: setPitchBend cancels 1.75 semitones of static tuning because it rebuilds rate using only note, rootKey, and bend

- timestamp: 2026-08-12T20:30:00-03:00
  source: isolated SynthEngine harness with valid sample-header loop points and zone sampleModes=0
  observation: AudioBufferSourceNode.loop was true although SF2 mode 0 requires unlooped playback
  implication: sampleObj.hasLoop is incorrectly treated as loop authorization; it should only validate boundaries when sampleModes is 1 or 3

- timestamp: 2026-08-12T20:38:00-03:00
  source: isolated SynthEngine harness with two key-matching zones covering velocities 1-50 and 51-100, triggered at velocity 127
  observation: two sources were created although neither velRange matched
  implication: key-only and nearest-zone fallbacks violate SF2 zone eligibility and layer samples that should remain silent

- timestamp: 2026-08-12T20:48:00-03:00
  source: pre-fix node:test regression suite
  observation: all seven focused tests failed with exact measured divergences: unauthorized loop, mode-3 loop retained on release, pitch bend tuning loss, two voices outside velRange, incorrect generator totals, originalPitch 0/127 rewritten to 60, and stale cache v1
  implication: each planned change has an independently reproducible red test and a concrete expected outcome
- timestamp: 2026-08-12T21:05:00-03:00
  source: post-fix node:test suite and repeated stability run
  observation: all 8 regression tests passed, then passed in 20 consecutive runs with zero failures; node syntax checks and git diff --check passed
  implication: each reproduced mechanism is corrected and stable in the isolated engine/parser/service-worker harness
- timestamp: 2026-08-12T21:05:00-03:00
  source: post-fix parse of C:\tmp\bensf2_sf_spec_test_20260812\sf_spec_test.sf2
  observation: the public fixture parsed successfully with 7 presets, 46 samples, and 174 valid zones; 21 formerly emitted preset/instrument combinations were removed because their effective range intersection is empty
  implication: real SF2 parsing remains operational while invalid cross-range voices are no longer synthesized
- timestamp: 2026-08-12T20:23:47-03:00
  source: final audit follow-up and direct inspection of js/sf2-parser.js:391-410 and js/synth-engine.js:327-348
  observation: linkPresetsToSamples replaces every zones=[] result with 0..127 fallback zones, while noteOn considers zones=[] equivalent to an absent zones property and creates a legacy default zone
  implication: an empty intersection is incorrectly converted into playable audio in both producer and consumer; empty arrays must remain authoritative while only an absent property may opt into legacy synthesis
- timestamp: 2026-08-12T20:27:00-03:00
  source: pre-fix end-to-end node:test regression with preset range 0..40 and instrument range 60..127
  observation: the parser reported one sample zone and SynthEngine created one AudioBufferSourceNode; assertion observed zoneCount=1/sourceCount=1 instead of 0/0
  implication: the review finding is reproducible across the actual parser-to-engine boundary and both fallbacks must be corrected
- timestamp: 2026-08-12T20:32:00-03:00
  source: post-fix focused end-to-end node:test regression
  observation: the parser reported zero sample zones and the regression passed with zoneCount=0/sourceCount=0
  implication: parsed empty intersections remain authoritative across the parser-to-engine boundary after the proportional fix
- timestamp: 2026-08-12T20:36:00-03:00
  source: post-fix complete node:test suite and real SoundFont-Spec-Test fixture parse
  observation: all 9 regressions passed; the real fixture parsed as 7 presets, 46 samples, 174 zones, and 0 empty presets
  implication: the new end-to-end protection is green without regressing the real fixture's stable preset, sample, or zone counts
- timestamp: 2026-08-12T20:40:00-03:00
  source: post-fix stability and static verification
  observation: the full 9-test regression suite passed in 20 consecutive runs with zero failures; node --check passed for parser, synth, and tests; git diff --check passed
  implication: the empty-zone correction is stable and syntactically clean; remaining scaleTuning/pan work is intentionally deferred to its dedicated TDD continuation
- timestamp: 2026-08-12T20:42:00-03:00
  source: follow-up inspection of SynthEngine legacy fallback guard
  observation: hasZonesProperty is false when presetObj is null, so matchingZones.length===0 && !hasZonesProperty selects the first decoded buffer for an invalid preset index
  implication: the guard must require presetObj existence in addition to zones-property absence; missing presets must remain silent
- timestamp: 2026-08-12T20:44:00-03:00
  source: pre-fix invalid-preset node:test regression
  observation: assigning preset index 99 with only preset 0 loaded created one AudioBufferSourceNode instead of zero
  implication: the missing-preset fallback defect is directly reproducible and the guard is the active cause
- timestamp: 2026-08-12T20:47:00-03:00
  source: post-fix focused invalid-preset node:test regression
  observation: the same invalid preset index now creates zero sources and the focused test passes
  implication: legacy fallback now requires an existing preset object as intended
- timestamp: 2026-08-12T20:52:00-03:00
  source: final fallback verification matrix after invalid-preset guard correction
  observation: all 10 regressions passed; the real fixture remained 7 presets/46 samples/174 zones/0 empty presets; 20 consecutive suite runs had zero failures; parser/synth/test syntax and git diff checks passed
  implication: empty arrays and missing presets remain silent while the proportional legacy compatibility path is isolated to existing presets that omit zones
- timestamp: 2026-08-12T21:26:00-03:00
  source: pre-fix expanded node:test regression suite
  observation: 9 of 15 tests passed; six focused tests failed on scale key tracking, missing per-voice panners, undefined scaleTuning/pan/sampleLink/sampleType zone fields, discarded binary sampleLink, and unaligned odd RIFF/LIST chunks
  implication: each requested follow-up has direct RED reproduction while all prior regressions remain green; binary sampleType bit 0x10 detection itself is already correct
- timestamp: 2026-08-12T21:36:00-03:00
  source: first post-fix expanded node:test run
  observation: all 15 tests passed, including scaleTuning key tracking through pitch bend, spatially separated stereo voices with panner cleanup, generator defaults/override/add/clamp semantics, binary sampleLink/sampleType preservation and SF3 rejection, and RIFF/LIST padding
  implication: all six focused RED failures turned green without regressing the prior nine tests
- timestamp: 2026-08-12T21:41:00-03:00
  source: post-fix parse and invariant scan of C:\tmp\bensf2_sf_spec_test_20260812\sf_spec_test.sf2
  observation: fixture remains 7 presets, 46 samples, 174 zones, and 0 empty presets; raw operators are exactly scaleTuning=7 and pan=32; all final zones have scaleTuning 0..1200 and pan -500..500; all zones preserve sampleType; linked sample headers preserve sampleLink; hard-left and hard-right zones are 13 each
  implication: real binary parsing retains prior counts while exposing valid scale/pan and stereo linkage/type invariants
- timestamp: 2026-08-12T21:47:00-03:00
  source: post-fix repeated stability run
  observation: the complete 15-test suite passed in 20 consecutive completed runs with zero failures
  implication: the scaleTuning, pan routing, metadata, padding, and prior regression fixes are stable under repetition
- timestamp: 2026-08-12T21:49:00-03:00
  source: post-fix static and scoped diff review
  observation: node --check passed for parser, synth, and regression tests; git diff --check passed; this continuation's behavioral edits are confined to parser/synth/tests/debug state, while other dirty files are preserved as existing or parallel work
  implication: the implementation is syntactically and textually clean with no unrelated reverts or writes
- timestamp: 2026-08-12T21:53:00-03:00
  source: final-suite verification after adding no-StereoPannerNode coverage
  observation: all 16 tests passed; the added test directly observed voice gain connecting to channel gain with pannerNode=null when createStereoPanner is unavailable; syntax and diff checks remained clean
  implication: both standards panner routing and its compatible fallback are covered
- timestamp: 2026-08-12T21:56:00-03:00
  source: final repeated stability run after all regression coverage was complete
  observation: the final 16-test suite passed in 20 consecutive runs with zero failures
  implication: the complete follow-up regression matrix is stable and ready for root review plus human audition
- timestamp: 2026-08-12T22:12:00-03:00
  source: final code-audit follow-up checkpoint
  observation: audit identified a multi-bank sample namespace collision when invalid headers are skipped, retained voices/nodes after natural source endings, and unchecked RIFF/LIST declared bounds; it also requested renaming the stereo regression to describe explicit pan routing
  implication: return to investigating and reproduce each mechanism independently under strict TDD before applying proportional fixes
- timestamp: 2026-08-12T22:22:00-03:00
  source: three independent pre-fix node:test executions
  observation: multi-bank regression decoded bank B at [0,1] instead of reserved [1,2]; natural-end regression found source.onended=null and retained cleanup ownership; malformed-bounds regression exposed RangeError from DataView instead of the stable format error
  implication: all three audit mechanisms have direct RED reproduction without changing production behavior
- timestamp: 2026-08-12T22:27:00-03:00
  source: focused post-fix multi-bank namespace regression
  observation: bank B now occupies reserved keys [1,2], linked headers/zones remap to [2,1], and triggering invalid bank A creates zero sources
  implication: header cardinality, not decoded success, now owns the monotonic sample namespace and prevents cross-bank alias playback
- timestamp: 2026-08-12T22:31:00-03:00
  source: focused post-fix natural-end lifecycle regression
  observation: source.onended is installed; invoking it removes the exact map entry, disconnects source/gain/panner, calls stop zero times, and a repeated invocation is harmless
  implication: natural one-shot completion now releases all owned voice resources through an idempotent path distinct from explicit stopping
- timestamp: 2026-08-12T22:37:00-03:00
  source: focused post-fix malformed RIFF/LIST bounds regression
  observation: all six minimal malformed structures now throw the exact stable Error message, including short RIFF, oversized fileSize/chunks, truncated top header, short LIST type, and oversized LIST subchunk
  implication: reads and traversal are proven to stay inside declared RIFF/LIST parent boundaries instead of leaking DataView RangeError
- timestamp: 2026-08-12T22:49:00-03:00
  source: final complete suite and repeated stability verification
  observation: npm.cmd test passed all 19 regressions; the same 19-test suite then passed in 20 consecutive runs with zero failures
  implication: all prior 16 protections and the three new mechanisms coexist stably
- timestamp: 2026-08-12T22:49:00-03:00
  source: final public fixture, static, and scoped worktree verification
  observation: SoundFont-Spec-Test remains 7 presets/46 samples/174 zones/0 empty presets with op56=7/op17=32, bounded final values, preserved links/types, and 13 hard-left/13 hard-right zones; node --check passed parser/synth/tests; git diff --check passed; README/MEMORY accuracy edits and all other existing dirty files were preserved
  implication: real SF2 parsing invariants and syntax/text integrity remain intact without reverting unrelated work

## Resolution

root_cause: BenSF2 independently violated several SF2 playback and lifecycle contracts: loop points overrode sampleModes; pitch bend rebuilt playbackRate without static tuning; range fallbacks played excluded zones, including treating authoritative zones=[] as missing legacy metadata; global/local generators were merged incorrectly; valid originalPitch extremes were rewritten; compressed SF3 bytes were treated as PCM; scaleTuning/pan/linkage metadata were discarded; voice routing summed explicit pan centrally; odd chunks desynchronized parsing; RIFF/LIST sizes were trusted beyond parent/data bounds; multi-bank sample offsets were derived only from decoded buffers so invalid samples allowed later-bank index aliasing; naturally ended sources retained their active voice and nodes; and the PWA retained a stale app shell.
fix: Corrected generator/range/attenuation/pitch/loop semantics and fallbacks; preserved and applied scaleTuning, pan, sampleLink, and sampleType; added per-voice pan routing; rejected unsupported SF3; aligned and parent-bounded RIFF/LIST traversal with one stable malformed-format error; reserved a monotonic sample namespace by every loaded bank's header cardinality and remapped valid linked-sample references including local link 0; kept undecodable sample zones silent; attached an idempotent natural-end cleanup that removes the precise voice and disconnects its source/gain/panner without stopping an already-ended source; rotated the service-worker cache; and corrected README/MEMORY capability claims.
verification: Strict TDD completed for the final audit: 19 tests were initially 16 pass/3 focused RED failures, then all 19 passed after proportional fixes and passed in 20/20 consecutive repeated runs. npm.cmd test, node syntax checks for parser/synth/tests, and git diff --check passed. The public fixture remains 7 presets/46 samples/174 zones/0 empty presets with raw op56=7/op17=32, bounded values, 13 hard-left/13 hard-right zones, and preserved links/types. Envelope, filter, and sample/loop offset generators remain known limitations; browser/Electron perceptual audition is still required before resolution.
files_changed: [js/sf2-parser.js, js/synth-engine.js, js/app.js, index.html, sw.js, package.json, test/sf2-regressions.test.js, README.md, MEMORY.md]
