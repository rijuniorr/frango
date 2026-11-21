# FRANGO — crítica de design/UX (v0.6, 21/nov/2026)

Bot: `qa/design/bot.mjs` (Playwright 1.65, toque real via CDP no Chromium; WebKit pros iPhones). Sondas extras: `avatar-probe.mjs`, `gesture-probe.mjs`.
Prints: `qa/design/shots/<viewport>/` — `s23` (360×780, Chromium/Android), `se1` (320×568, WebKit), `se2` (375×667, WebKit), `ip15` (390×844, WebKit), `promax` (430×932, WebKit), `ip15-notch` (390×844 Chromium com safe-area 59/34 simulada), `se1-chromium`. Cada pasta tem `report.json` (alvos <44px, medições, notas dos gestos).
Rodar de novo: `cd qa/design && npm i && node bot.mjs [s23 se1 …]` com o vite em :5181. O app não força tema claro (`color-scheme: dark` fixo), então escuro/claro dá igual.

> Aviso: nas 1ªs rodadas WebKit o `page.route` não segurou a rede (o service worker do app responde antes) e chamadas anônimas chegaram no Supabase de produção — todas **recusadas** (RLS / 400), nada gravado. O bot agora usa proxy morto + `serviceWorkers: 'block'`.

---

## CRÍTICO

### 1. Foto de perfil vira quadradinho (Perfil) e some de vez (Feed/posts) — todos os aparelhos
- **O que:** no Perfil a foto aparece 32×32 no meio de um círculo verde de 64. No Feed (card "who" e topo dos posts) a img fica **0×0**: só um círculo verde vazio, e o círculo do "eu" fica 32px enquanto o do outro fica 28px. Mesmo sem foto, a letra "R" do "eu" fica deslocada/miúda.
- **Reproduzir:** Perfil → tocar no avatar → escolher foto → usar. Prints: `shots/s23/47-avatar-zoom.png`, `shots/s23/48-avatar-no-feed.png`, `shots/s23/61-comentario-digitando.png` (post do Ricardo com bolota verde), `shots/ip15/11-feed-rolado-1.png` (R miúdo).
- **Causa (medida):** colisão de classe. `src/ui.tsx:90` monta `<span className="av me">` pro avatar do usuário logado, e `src/index.css:247` tem `.me { display:flex; align-items:center; gap:12px; padding:16px }` feito pro **card** do Perfil (`src/Eu.tsx:356` `card me`). O span do avatar herda `padding:16px` → com `box-sizing:border-box`, sobra 64−32 = 32px de conteúdo (Perfil) e 28−32 < 0 → img 0×0 (Feed); o padding também alarga o círculo pra 32px. `.me span` (index.css:250) ainda pinta spans internos de cinza 13px.
- **Correção:** renomear um dos dois. Ex.: `Eu.tsx:356` → `className="card me-card"` e `index.css:247-250` `.me`→`.me-card`. (Ou o modificador do avatar → `.av.mine` em `ui.tsx:90` + `index.css:102`.) Depois disso `.av img {width:100%;height:100%;object-fit:cover}` já preenche certo (verificado na sonda: no avatar sem `.me` a img fica 28×28).

### 2. Antes/depois sequestra o dedo: rolar a página mexe a foto e o deslizar de aba nunca funciona em cima dela
- **O que:** (a) qualquer rolagem vertical que começa em cima da foto **move a barra** pra onde o dedo encostou (medido: rolei pra cima com o polegar em x=80% → barra foi de 50% pra 79,8%). Um simples toque também teleporta a barra. (b) deslizar pro lado em cima da foto só arrasta a barra, não troca de aba. Como a foto 3:4 ocupa ~85% da largura e quase a altura toda da tela (Feed e Evolução), na prática **o swipe de aba só funciona no cabeçalho**.
- **Reproduzir:** Feed → rolar com o dedo em cima da foto; ou deslizar horizontalmente em cima dela. Prints: `shots/s23/16-swipe-em-cima-do-antesdepois.png`, `17-antesdepois-apos-arrasto.png`, `shots/se2/36-evo-gabriel.png` (no SE a foto é a tela inteira). Sonda: `gesture-probe.mjs`.
- **Causa:** `src/ui.tsx:14` chama `move(e)` já no `pointerdown` e `onPointerMove` move enquanto `buttons` (sem decidir eixo); `.cmp { touch-action: pan-y }` (index.css:145) deixa o navegador rolar **e** entregar os pointermoves. Em `src/App.tsx:85` `.cmp` está na lista de bloqueio do swipe.
- **Correção (padrão iOS Fotos/Instagram):** só arrastar a barra se o toque começar **na alça** (±28px da linha); em qualquer outro ponto, deixar o gesto pro swipe de aba/rolagem. Sem teleporte no toque. Ex.: em `pointerdown` comparar `e.clientX` com a posição da barra; se longe, `return` (e tirar `.cmp` da lista em App.tsx:85, trocando por `.cmp .bar`). Aumentar a alça pra 44px.

### 3. Sheets não rolam no toque — no iPhone SE o "agora não" do aviso de instalar fica fora da tela
- **O que:** no SE (320×568) o aviso de instalar (iOS, 3 passos) tem 548px de conteúdo em 500px de sheet; o botão "agora não" fica escondido e **não dá pra rolar**. Igual no sheet "O que você treinou?": "desmarcar treino" some e o "Marcar treino" fica cortado. O aviso volta todo dia.
- **Reproduzir:** abrir `/` num 320×568 sem ter dispensado o aviso. Prints: `shots/se1/00-login-com-aviso-instalar.png`, `shots/se1/23-sheet-treinei.png`. Medido: `report.json` → `install sheet: h 500, scrollHeight 548, touchAction none`.
- **Causa:** `src/index.css:351` `.sheet-card { … overflow-y:auto; touch-action:none }` — `touch-action:none` mata a rolagem por toque do próprio sheet.
- **Correção:** `touch-action:none` só na alça (`.grab`), `.sheet-card { touch-action: pan-y }`; e enxugar: ícone 56px, passos mais baixos em telas < 600px de altura.

## ALTO

### 4. Deslizar entre abas parece travado e "pisca" ao soltar
- **O que:** a tela anda só 45% do dedo (dedo 250px → tela 112px), sem mostrar a próxima aba entrando. Ao soltar, a tela some de −112px e reaparece em **+29px com opacidade 0,19** (pula pro lado oposto e quase some) — é o "travado"/"engasgado". Nativo (Android ViewPager / iOS page) segue o dedo 1:1 com a próxima página visível e continua o movimento de onde o dedo parou.
- **Reproduzir:** Feed → arrastar no cabeçalho pra esquerda devagar e soltar. Prints: `shots/s23/14-swipe-meio-arrasto.png` (meio do arrasto: conteúdo cortado à esquerda, vazio à direita), `15-swipe-apos-soltar.png`, `19-swipe-borda-elastico.png`. Medido em `gesture-probe.mjs` (30ms após soltar: `translateX(29px)`, `opacity .19`).
- **Causa:** `src/App.tsx:100` (`dx * 0.45`, opacity até .65), `App.tsx:111-113` limpa o transform e troca a `key` do `<main>` (remonta) → a animação nova começa de `translateX(36px); opacity:0` (`index.css:408-409`), sem relação com onde o dedo estava.
- **Correção mínima:** seguir 1:1 (`dx` sem fator, resistência só na borda); ao confirmar, animar a tela atual até `-100%` (≈200ms), e só então trocar de aba com a nova entrando de `+100%`→0 **sem fade a zero** (opacity mínima .9). Ideal: renderizar a aba vizinha ao lado durante o arrasto (trilho com 2 painéis).

### 5. Zonas mortas do swipe cobrem quase toda a Evolução e o Hoje
- **O que:** o swipe é desligado se o dedo começa em `.cmp, .chart svg, input, textarea, .days, .seg, .replay, .ruler` (`src/App.tsx:85`). Na Evolução isso é seg + foto + replay + gráfico = quase a tela toda; no Hoje a fileira de dias. Medido: swipe começando nos dias → continua em Hoje; no gráfico → continua em Evolução.
- **Correção:** mesma lógica do item 2 — decidir eixo antes (já existe em `onTouchMove`), e deixar o gráfico só "scrubbar" depois de um long-press curto (~150ms) ou só no eixo vertical; dias e seg são toques, não arrastos: não precisam bloquear o swipe (a detecção de eixo já impede o clique acidental).

### 6. Sheet de categorias estoura a lateral no iPhone SE
- **O que:** em 320px a coluna da direita passa da borda — "Alongamento" encosta/corta na tela.
- **Print:** `shots/se1/23-sheet-treinei.png`.
- **Causa:** `src/index.css:357` `.kinds { grid-template-columns: 1fr 1fr }` — `1fr` tem mínimo = min-content da palavra mais longa.
- **Correção:** `repeat(2, minmax(0, 1fr))` + `min-width:0` no botão, emoji 20px e `gap` 8 / `padding` 12 abaixo de 360px.

### 7. "Segura pra postar": texto fica rosa/magenta durante o segurar
- **O que:** a parte do texto sobre o verde fica magenta ("segu" rosa, "ra…" branco). Parece bug.
- **Prints:** `shots/s23/58-segurar-pra-postar-meio.png`, `shots/ip15/58-segurar-pra-postar-meio.png`.
- **Causa:** `src/index.css:300` `.hold span { mix-blend-mode: difference }` (branco − #1EFF7A = magenta).
- **Correção:** duas camadas de texto: a de baixo branca, a de cima `color: var(--g-ink)` recortada com `clip-path: inset(0 calc(100% - var(--p)*100%) 0 0)` no mesmo progresso da barra.

### 8. Conteúdo rola por baixo do relógio/notch e não há "chão" atrás do dock
- **O que:** com `apple-mobile-web-app-status-bar-style: black-translucent` (`index.html:8`) o app instalado no iPhone desenha atrás da status bar; o `.screen` só tem `padding-top: max(14px, env(safe-area-inset-top))` (`index.css:47`) — ao rolar, cards e fotos passam **por baixo do relógio/bateria** sem nenhum fundo. Embaixo, o dock é vidro translúcido sem degradê: rótulos inativos (#8a8d88) ficam ilegíveis em cima de foto clara.
- **Prints:** `shots/ip15-notch/11-feed-rolado-1.png` (safe-area simulada), `shots/ip15/11-feed-rolado-1.png` (rótulos "Hoje/Evolução" sobre a foto).
- **Correção:** faixa fixa no topo `position:fixed; top:0; height:env(safe-area-inset-top); background: linear-gradient(var(--bg) 60%, transparent)` (ou cabeçalho sticky com blur, como iOS); no dock, `background: rgba(20,21,20,.78)` e um degradê preto de ~100px atrás dele (`.dock::before`).

### 9. Alvos de toque abaixo de 44px em quase todo botão secundário
- **Medido (report.json):** `.ib` 38px de altura (sair, fechar, pular, galeria, virar, cancelar, usar, girar, resetar, 1×); chips frente/lado/costas 32px; curtir 34px (44×34 sem número); `.later` ("agora não", "desmarcar treino") 32px; +/− das regras 38×38; seg 38px; sliders (fantasma, zoom, replay) com área de 16px; dias da semana 42px de largura em 360 (36px no SE).
- **Causa:** `index.css:55` (.ib padding 9px), `:157` (chips 7px), `:130` (like), `:355` (.later), `:260` (step 38px), `:164` (seg), `:281` (.fade).
- **Correção:** `min-height:44px` em `.ib, .chips button, .like, .later, .seg button`; `.step button` 44; range com `height:44px` e trilho fino desenhado via `::-webkit-slider-runnable-track`.

### 10. `text-transform: capitalize` estraga português
- **O que:** "Sábado, 21 **De Nov.**", "Foto **De** Perfil", "0/3 **Fotos**", "**Check-In**", "Ajustar · Frente". Em pt-BR só a 1ª letra vai maiúscula; parece tradução automática.
- **Prints:** `shots/s23/20-hoje.png`, `43-editor-perfil.png`, `51-checkin-camera.png`, `55-checkin-form.png`.
- **Causa:** `src/index.css:54` `.pill { text-transform: capitalize }`.
- **Correção:** tirar o capitalize; quando quiser só a primeira (data no Hoje), fazer no texto (`s[0].toUpperCase() + s.slice(1)`) ou `.pill::first-letter { text-transform: uppercase }`.

### 11. Pesos grandes em Geist Mono ficam "81 , 6"
- **O que:** na fonte mono a vírgula ocupa uma célula inteira → o número lê como "81 , 6" (Feed, Perfil, régua do check-in, posts). Fica com cara de terminal, não de app de saúde.
- **Prints:** `shots/s23/10-feed-topo.png`, `40-perfil.png`, `55-checkin-form.png`, `shots/s23/48-avatar-no-feed.png` (zoom).
- **Causa:** `index.css:104` (.kg b), `:291` (.ruler-val b), `:334` (.goal b), `:124` (.stats b), `:210` (.stat b).
- **Correção:** números grandes em **Geist** com `font-variant-numeric: tabular-nums` (mantém alinhamento sem buraco na vírgula); ou envolver a vírgula num `<span style="margin:0 -.25em">`. Mono só pra números pequenos de tabela.

### 12. iPhone SE: textos quebrando feio nos cards
- **O que:** Feed: "kg → / 78,0", "-3,0 kg desde o / início", "4 / treinos" + "2/2 / besteiras" em 2 linhas cada. Evolução: grade de 4 colunas quebra "Check- / ins" e joga "kg" numa linha sozinha. Hoje: "bolacha, fritura, doce… seja / honesto" (viúva, também no S23).
- **Prints:** `shots/se1/10-feed-topo.png`, `shots/se1/32-evo-ricardo-fim.png`, `shots/s23/20-hoje.png`, `shots/s23/48-avatar-no-feed.png` (Gabriel "kg → / 85,0" já no S23).
- **Causa:** `index.css:96` (.duo 2 colunas sem ajuste), `:207` (.grid 4 colunas fixas), `:103-112`.
- **Correção:** `@media (max-width:360px)`: `.grid` 2 colunas (ou 4 com rótulos de 1 palavra: "Check-ins"→"Fotos"), `.kg span` em linha de baixo de propósito (meta como `→ 78` em `small`), "desde o início" → "no total", `.mini` em coluna. `text-wrap: balance` nos subtítulos.

## MÉDIO

### 13. Check-in (formulário): botão principal flutua no meio, vazio embaixo
- **O que:** "Segura pra postar" fica a ~60% da altura com ~200px pretos embaixo; o "igual à última" fica alinhado à esquerda enquanto o peso é centralizado. Padrão nativo: ação principal presa no rodapé (acima da barra de gestos) e textos de apoio centralizados com o número.
- **Prints:** `shots/s23/55-checkin-form.png`, `57-checkin-form-fim.png`.
- **Causa:** `index.css:268-269` (.sheet coluna sem empurrar), `CheckIn.tsx:172` (hint fora do bloco centralizado).
- **Correção:** `.hold { margin-top:auto; position: sticky; bottom: max(20px, env(safe-area-inset-bottom)) }` e `.sheet .hint { text-align:center }`.

### 14. Editor de foto: máscara do recorte redondo é "amadora"
- **O que:** o escurecimento fora do círculo só existe dentro de um quadrado de cantos arredondados; fora dele a foto some no preto. Fica um "quadrado com círculo dentro". iOS/Android escurecem a tela inteira e deixam só o círculo. No WebKit o slider de zoom é cinza (sem `accent-color`) e no Android é verde — inconsistente.
- **Prints:** `shots/s23/43-editor-perfil.png`, `shots/se1/43-editor-perfil.png` (WebKit, slider cinza), `44-editor-pinca-meio.png`.
- **Causa:** `index.css:387` (.crop-box overflow hidden + radius 20) e `:400-401` (máscara via radial-gradient só dentro da caixa); `:281` `.fade { accent-color }` não pega no Safari.
- **Correção:** `.crop-box { overflow: visible }` com a img vazando, e a máscara `box-shadow: 0 0 0 100vmax rgba(0,0,0,.65)` num `<i>` circular (o `.crop` já tem `overflow:hidden`); slider custom (trilho + thumb) igual nas duas plataformas. Mostrar o "% de zoom" não precisa.

### 15. Mensagens de erro cruas em inglês/técnico
- **O que:** "Não salvou: TypeError: Failed to fetch", "Foto não subiu: new row violates row-level security policy", "Câmera falhou: Not supported". E o toast de erro **substitui** o xingamento ("ESTOUROU O LIMITE") que tinha acabado de aparecer.
- **Prints:** `shots/s23/26-besteira-estourou-toast.png`, `shots/ip15/46-perfil-com-foto.png`, `shots/s23/51-checkin-camera.png`.
- **Causa:** `Hoje.tsx:163`, `Eu.tsx:300,325`, `CheckIn.tsx:117,141` concatenam `error.message`.
- **Correção:** mapear pra frases humanas ("Sem internet — salvo quando voltar", "Não deu pra abrir a câmera. Usa a galeria."), e não sobrescrever um toast `roast` com um `ok` comum (fila ou prioridade).

### 16. "sair" é o botão mais acessível do Perfil e desloga sem confirmar
- **O que:** no canto superior direito (onde iOS põe "Editar"), um toque = logout imediato.
- **Print:** `shots/s23/40-perfil.png`. **Causa:** `src/Eu.tsx:353`.
- **Correção:** mover pro fim da página (linha vermelha "Sair da conta") com confirmação (sheet "Sair?").

### 17. `.card:active { scale(.96) }` em todo card
- **O que:** toda `.card` encolhe quando apertada — inclusive post inteiro, gráfico, formulário, heatmap. No iOS (React põe listener de toque na raiz, então `:active` dispara) começar a rolar em cima de um post faz o card inteiro "afundar". Não reproduzi no Chromium headless (`:active` não aplicou), mas o seletor é amplo demais.
- **Causa:** `src/index.css:56`.
- **Correção:** aplicar só em cards clicáveis: `.cta:active, .big-q:active, .kinds button:active`.

### 18. Aviso de instalar: passos com número "solto"
- **O que:** o número verde fica inline e a 2ª linha do texto volta pra baixo do número (sem recuo) — "2 Toca em Instalar app ou Adicionar à / tela inicial".
- **Prints:** `shots/s23/00-login-com-aviso-instalar.png`, `shots/se1/00-login-com-aviso-instalar.png`.
- **Causa:** `index.css:373-375` sobrescreve o `display:flex` de `:370-371` com `display:block`.
- **Correção:** apagar 373-375; manter flex com `.n` fixa e o texto num `<span>` com `flex:1`.

### 19. Gráfico de peso sem eixo nem valores
- **O que:** uma linha verde solta; sem kg mínimo/máximo, sem datas, sem meta. O texto "arrasta o dedo no gráfico" ocupa o lugar do título. Na dupla, a legenda "● Ricardo ● Gabriel" sai em fonte mono.
- **Prints:** `shots/se1/32-evo-ricardo-fim.png`, `shots/s23/33-grafico-arrastando.png`, `shots/se1/37-evo-dupla.png`.
- **Causa:** `Evolucao.tsx:118-150`; `index.css:215` (.chart-head b mono).
- **Correção:** rótulo do 1º e último peso nas pontas, linha tracejada da meta, datas em cima/embaixo; legenda em Geist.

### 20. Cabeçalhos inconsistentes entre abas
- **O que:** Feed = logo + pill "Semana 7"; Hoje = "frango." (o mesmo logo do Feed, mas sem desenho) + data; Evolução = só título; Perfil = título + "sair". Alturas e pesos diferentes; o Hoje repete a marca em vez de dizer "hoje".
- **Prints:** `shots/s23/10-feed-topo.png`, `20-hoje.png`, `30-evo-ricardo.png`, `40-perfil.png`.
- **Correção:** padrão único: título grande da aba (como Large Title do iOS) + 1 ação à direita; logo só no Feed.

### 21. Card "Instala o app" duplicado no fim do Perfil
- **O que:** além do sheet diário, o Perfil tem um card com o mesmo texto em linha corrida. Ruído.
- **Print:** `shots/se1/42-perfil-fim.png`. **Causa:** `Eu.tsx:405-410`.
- **Correção:** trocar por um botão "Instalar app" que reabre o sheet.

## BAIXO

22. **Rótulos do dock em 8,3px no SE** — `index.css:412` `font-size: min(10px, 2.6vw)`. Abaixo do mínimo legível (11px iOS). Melhor esconder rótulos <340px e deixar só ícones, ou manter 10px e reduzir padding. Print `shots/se1/10-feed-topo.png`.
23. **Login:** placeholder da senha "•••" parece já preenchido; "ricardo ou gabriel" como placeholder é ok mas o campo podia ser 2 botões ("Sou o Ricardo / Sou o Gabriel"). `Login.tsx:52,56`. Print `shots/s23/01-login.png`.
24. **Rodapé "frango · v0.6"** em #3c3e3c ≈ 1,9:1 de contraste (`index.css:61`). Aceitável como marca d'água, mas invisível em sol.
25. **Fontes via `@import` do Google** (`index.css:1`): primeira abertura/offline cai na fonte do sistema e "pula" quando a Geist chega. Servir os .woff2 em `public/` e `font-display: swap` com `size-adjust`.
26. **Thumb do slider "fantasma" sem rótulo** na câmera (`CheckIn.tsx:145`): ninguém sabe pra que serve. Ícone de fantasma + "transparência".
27. **Dias futuros** no Hoje aparecem quase invisíveis (opacity .35) — ok, mas o "dom 22" some no fundo escuro; usar borda tracejada.

---

## Resumo
O visual base (preto/verde, vidro só no dock, molas) é bom, mas o acabamento quebra nos detalhes que se sentem no dedo: a foto de perfil é um bug de CSS de 1 linha (colisão `.me`), e o antes/depois + zonas mortas tornam o swipe de aba praticamente inutilizável.
No iPhone SE há telas que não dá pra terminar (sheet sem rolagem, categorias estourando a borda) e muitos textos quebrando; alvos de toque de 32–38px por toda parte.
Prioridade: itens 1–3 (horas), depois 4–8 (sensação de app nativo), depois 9–12 (polimento tipográfico/toque).
