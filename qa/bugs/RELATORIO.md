# FRANGO — relatório do bot de teste (v0.6, commit 388d9ba)

21/11/2026 · modo demo (`/?demo`) · Playwright 1.65, Chromium (toque real via CDP) + WebKit (toque sintético, o mesmo caminho que o React usa)
Telas: Galaxy S23 360×780, iPhone SE 375×667, iPhone 14 390×844, Pro Max 430×932, paisagem 780×360 / 844×390.
O Supabase fica bloqueado no bot (toda chamada volta 401), então nada vai pro banco de produção.

**Rodar de novo:** servidor em `node node_modules/vite/bin/vite.js --port 5182 --strictPort`, depois `node qa/bugs/run.mjs` (tudo, uns 6 min) ou `node qa/bugs/run.mjs avatar replay` (só os testes cujo nome tem essas palavras).
Saída: `qa/bugs/saida.txt`, `qa/bugs/resultado.json` e os prints em `qa/bugs/shots/` (gerados de novo a cada rodada, fora do git).

**Resultado:** 50 de 84 ok. As 34 falhas são todas bug real (os falsos positivos do bot já foram corrigidos). Os itens 16 a 26 saíram da leitura do código, nos caminhos que dependem do banco.

---

## CRÍTICO

### 1. Evolução: a tela fica toda preta ao trocar de pessoa ou ângulo quando o número de fotos muda
- **O que acontece:** o `Replay` guarda o índice `i` da última foto. Quando a lista de fotos fica menor, `frames[i]` vira `undefined` e o React derruba o app inteiro (não tem ErrorBoundary). O app só volta recarregando.
- **Passos:** Evolução → Ricardo, frente (replay na última semana, i=6) → toca em "lado", que só tem 3 fotos. Vale também pra Ricardo → Gabriel quando o Gabriel tem menos check-ins com foto, o que **vai acontecer de verdade** (o `Solo` é reaproveitado e o estado do Replay continua o mesmo).
- **Onde:** Chromium e WebKit, S23. Esperado: o replay vai pra última foto do novo conjunto. Obtido: `pageerror: Cannot read properties of undefined (reading 'label')` / `frames[i].label` e a tela morre. Print: `shots/evo-lado-crash.png`.
- **Causa:** `src/Evolucao.tsx:158` (`useState(frames.length - 1)`) e `src/Evolucao.tsx:172` (`frames[i].label`), com `src/Evolucao.tsx:49` sem `key`.
- **Correção:** `<Replay key={p.id + angle} …/>` em Evolucao.tsx:49, ou limitar `const k = Math.min(i, frames.length - 1)`. Vale também um ErrorBoundary simples em `main.tsx`, pra um bug numa aba não derrubar o app todo.

## ALTO

### 2. Foto de perfil: o "quadradinho" no Perfil e a foto invisível no Feed (causa achada)
- **O que acontece:** no Perfil a foto aparece com 32×32 dentro do círculo de 64 (sobra borda verde). No Feed (avatar de 28px) a imagem fica com **0px**: a foto some e sobra só a bolinha verde vazia. A letra do seu avatar também fica escondida.
- **Passos:** Perfil → toca na foto → escolhe imagem → usar. Depois volta pro Feed.
- **Onde:** todas as telas, Chromium e WebKit. Medido: `{"av":[64,64],"img":[32,32],"nat":[500,500]}` e, no feed, `img 0 / av 32`. Prints: `shots/chromium-s23-25-avatar.png`, `shots/webkit-i14-25-avatar.png`.
- **Causa:** colisão de classe CSS. O `Avatar` coloca `className="av me"` em `src/ui.tsx:90`, e a regra do *card* do perfil `.me { display:flex; gap:12px; padding:16px }` em `src/index.css:247` (e também `.me span`, linha 250) acaba pegando no avatar. Os 16px de padding de cada lado comem 32px: no círculo de 64 sobram 32, no de 28 sobra zero. O editor e o arquivo gerado (500×500) estão certos.
- **Correção:** renomear a classe do avatar (`.av.eu`, ou `.av.mine`) em ui.tsx:90 e index.css:102, **ou** a do card (`card me` → `card perfil` em Eu.tsx + index.css:247–250). Dá pra blindar também com `.av { padding: 0 }`.

### 3. Deslizar dentro de um sheet ou do editor de foto troca de aba e fecha tudo
- **O que acontece:** o sheet "O que você treinou?" (Hoje) e o editor da foto de perfil são portals. O React manda os eventos de toque de dentro do portal pro `<main>`, que trata como deslizar de aba. Ao arrastar a foto pro lado no editor, ou deslizar nos chips de categoria, o app pula pra outra aba, a tela atual desmonta e o editor/sheet some, junto com o que você estava fazendo. Pinça com dois dedos no editor também conta (o 2º dedo entra depois do `touchstart`).
- **Passos:** Perfil → foto → no editor, arrasta a imagem ~60% da largura pra direita → cai na Evolução, sem editor. Ou: Hoje → Treinei → desliza pro lado sobre os chips → cai na Evolução, sem sheet.
- **Onde:** Chromium e WebKit, S23. Esperado: o editor/sheet continua aberto. Obtido: `{"tab":"Evolução","crop":0}` / `{"tab":"Evolução","sheet":0}`.
- **Causa:** `src/App.tsx:84-86` (`onTouchStart` não confere se o alvo está mesmo dentro do `<main>`), com `src/ui.tsx:99` (Sheet) e `src/Cropper.tsx` (createPortal).
- **Correção:** primeira linha do `onTouchStart`: `if (!e.currentTarget.contains(e.target as Node)) { touch.current = null; return }`. Em `onTouchMove`, cancelar se `e.touches.length > 1`.

### 4. Deslizar entre abas não funciona em cima do antes/depois, e rolar a página com o dedo na foto mexe a barra
- **O que acontece:** (a) o toque que começa em `.cmp` é ignorado de propósito, e a foto ocupa ~70% do Feed, então "deslizar está travado" no Feed. (b) Ao **rolar** o feed com o dedo em cima da foto, o `pointerdown` já move a barra até o dedo (50% → 85%).
- **Passos:** (a) Feed → desliza rápido da direita pra esquerda sobre a foto → continua no Feed. (b) Feed → arrasta pra cima com o dedo do lado direito da foto → a página rola, mas a barra pula pra 85%.
- **Onde:** (a) Chromium e WebKit; (b) Chromium (toque real). Esperado: trocar de aba / barra parada. Obtido: `"Feed"` / `{"bar0":"50%","bar1":"85%"}`.
- **Causa:** `src/App.tsx:85` (`closest('.cmp, …')`) e `src/ui.tsx:18` (`move(e)` direto no `onPointerDown`).
- **Correção:** a barra só mexe quando o arrasto começa perto dela (±40px da linha ou na bolinha `.bar b`). Nesse caso o App ignora o gesto, senão deixa o deslizar de aba seguir. No `Compare`, guardar o ponto inicial e só chamar `move` depois de confirmar que o arrasto é horizontal (|dx| > |dy| e > 8px), em vez de mover já no `pointerdown`.

### 5. App aberto de um dia pro outro: "Hoje" fica preso no dia anterior e grava no dia errado
- **O que acontece:** `day` é calculado uma vez, quando a aba monta. O PWA fica dias no segundo plano: abriu de manhã, tocou "Treinei" ou "+", e grava **no dia de ontem** sem avisar. Na virada de domingo pra segunda fica pior: o título vira `2026-11-22 VOCÊ TREINOU?` e nenhum dia aparece selecionado.
- **Passos:** relógio em dom 23:59 → aba Hoje → passa da meia-noite → toca "+".
- **Onde:** Chromium, S23 (relógio falso do Playwright). Esperado: "Hoje" e a segunda selecionada. Obtido: `{"h1":"2026-11-22 VOCÊ TREINOU?","sel":0}`.
- **Causa:** `src/Hoje.tsx:9` (`useState(today())`) e `src/Hoje.tsx:32`.
- **Correção:** guardar só o dia que a pessoa escolheu (`const [picked, setPicked] = useState<string|null>(null); const day = picked ?? today()`) e limpar `picked` no `visibilitychange` (ou quando `picked` sair da semana atual).

### 6. Toda mudança no banco recarrega tudo e reassina todas as fotos: imagens piscam e um toque pode ser perdido (código)
- **O que acontece:** o canal realtime escuta `*` em todas as tabelas e chama `reload()` a **cada evento**, inclusive os seus. Cada reload refaz 6 consultas e `createSignedUrls` de **todas** as fotos. As URLs novas fazem todas as imagens do feed baixarem de novo e piscarem a cada curtida ou besteira de qualquer um, gastando dados. Pior: se você toca "+" três vezes rápido, o evento do 1º upsert dispara um reload que pode chegar com `junk=1` enquanto a tela já mostra 3. O próximo toque calcula em cima do 1 e **grava valor errado** (perde besteira).
- **Onde:** leitura de código (o demo não tem realtime). Causa: `src/App.tsx:57-58`, `src/lib.ts:103` e `src/Hoje.tsx:20` (o `next` parte do `cur`, que veio do reload).
- **Correção:** (a) ignorar eventos do próprio usuário (`payload.new.user_id === uid`) ou juntar os reloads com um debounce de ~800ms; (b) no `load`, reaproveitar as URLs assinadas que já existem (`urls` antigo) e só assinar caminhos novos; (c) no Hoje, gravar com um incremento no servidor (RPC `junk = junk + 1`) ou ignorar reloads enquanto houver um save em andamento.

### 7. O service worker guarda tudo pra sempre, inclusive a API do Supabase e as fotos (código)
- **O que acontece:** o `sw.js` faz `cache.put` de **todo GET**, inclusive as respostas REST do Supabase e as fotos com URL assinada. Como cada reload gera URLs novas (item 6), cada abertura do app salva **mais uma cópia de todas as fotos** no Cache Storage, sem nunca apagar. Com o tempo, ocupa centenas de MB no celular, e o iOS pode apagar o armazenamento do site inteiro (e junto a sessão de login).
- **Causa:** `public/sw.js:5-9`.
- **Correção:** só cachear a mesma origem (`if (new URL(e.request.url).origin !== location.origin) return`) e, de preferência, só o app shell. Na mudança, trocar o nome do cache e limpar os antigos no `activate`.

## MÉDIO

### 8. Deslize curto que volta com mola repete a animação de entrada (tela pisca/pula)
- **O que acontece:** quando o deslize não passa do ponto, a classe `.dragging` (que tinha `animation:none`) sai e a `.snap` entra. Isso reaplica a animação `fromR`/`fromL`/`enter` e a tela **some e entra de novo deslizando** de 36px. Junto com o item 4, dá a sensação de "travado".
- **Passos:** Hoje (entrou pelo lado) → arrasta 45px devagar e solta.
- **Onde:** Chromium e WebKit. Esperado: só a mola de volta. Obtido: `getAnimations()` = `["fromR"]` logo depois de soltar.
- **Causa:** `src/App.tsx:115` e `src/index.css:410-411`, com `.screen` tendo `animation: enter` (index.css:48) e `from-r`/`from-l` (405-407).
- **Correção:** `.screen.dragging, .screen.snap { animation: none }`, ou tirar a classe `from-*` no `onAnimationEnd`.

### 9. Contagem regressiva continua depois de fechar ou pular o check-in → erro
- **Passos:** câmera ligada → toca no botão de foto → durante o 3-2-1 toca "fechar" (ou "pular").
- **Onde:** Chromium com câmera falsa. Obtido: `pageerror: Cannot read properties of null (reading 'videoWidth')` (2×). Reabrir o check-in antes dos 3s pode disparar foto/editor fantasma.
- **Causa:** `src/CheckIn.tsx:80-89` (o `setInterval` nunca é limpo no unmount) e `src/CheckIn.tsx:58` (`video.current!`).
- **Correção:** guardar o timer num ref e dar `clearInterval` no cleanup do componente e ao trocar de `step`. No `grab`, `const v = video.current; if (!v) return`.

### 10. Depois de um erro ao postar, o botão "segura pra postar" fica travado cheio, escrito "segura…"
- **Passos:** check-in → 3 fotos → próximo → segura até o fim → o envio falha (sem rede, por exemplo).
- **Onde:** Chromium e WebKit, S23 e SE. Esperado: volta pra "Segura pra postar". Obtido: `"segura…"` com a barra 100%. Print: `shots/chromium-s23-19-post-erro.png`.
- **Causa:** `src/ui.tsx:79` (`up()` só zera se `p < 1`; depois do `onDone` o `p` fica em 1).
- **Correção:** `useEffect(() => { if (!busy) setP(0) }, [busy])` no `Hold`, ou zerar `p` logo depois de chamar `onDone`.

### 11. Foto da galeria em HEIC (ou arquivo inválido): o botão "galeria" não faz nada e não avisa
- **O que acontece:** o `shrink` rejeita com um `Event`, ninguém trata, e sai um `unhandledrejection` sem mensagem nenhuma. O Galaxy S23 pode salvar em **HEIF** ("Fotos de alta eficiência"), e o Chrome Android não decodifica HEIC. Pro Ricardo, isso é "escolhi a foto e nada aconteceu". Vale pro check-in e pra foto de perfil.
- **Onde:** Chromium e WebKit. Obtido: `pageerror: Event`, sem toast.
- **Causa:** `src/lib.ts:54` (`img.onerror = rej`), `src/CheckIn.tsx:91-95` e `src/Eu.tsx:32-36` (sem try/catch).
- **Correção:** `try { … } catch { toast('Não deu pra abrir essa foto. Se for HEIC, muda a câmera pra JPEG.') }` nos dois lugares, e rejeitar com `new Error('formato')`.

### 12. Curtir: erro do banco não desfaz nem avisa; curtir/descurtir rápido pode deixar o banco diferente da tela
- **Passos:** curtir 7× rápido com o banco recusando.
- **Obtido:** a tela fica "curtido", sem aviso nenhum (7 respostas 401 ignoradas). Na vida real, `insert` e `delete` vão em paralelo e podem chegar fora de ordem: a tela diz uma coisa, o banco outra (o reload do item 6 corrige depois, piscando).
- **Causa:** `src/Feed.tsx:77-83`.
- **Correção:** ler o `{ error }`. Se der erro, desfazer o `mutate` e mostrar um toast. Bloquear um novo toque enquanto o anterior não volta (ref `busy`), ou usar `upsert`/`delete` em fila.

### 13. Comentário que falha some calado; Enter duplo duplica
- **Passos:** comentar "bora frango 🐔💪🏽" + Enter com o banco recusando.
- **Obtido:** o campo é limpo, o comentário não aparece e não tem aviso: o texto se perde. Sem trava, dois Enter rápidos mandam 2 inserts.
- **Causa:** `src/Feed.tsx:84-91` (não lê `error`, `setTxt('')` sempre).
- **Correção:** `const { error } = await …; if (error) return toast('Não foi: ' + error.message)`. Só limpar o campo depois de dar certo, e usar um `busy` pra travar o reenvio. Dá pra fazer otimista igual ao like.

### 14. Sheet de categorias não rola: em paisagem, o botão "Marcar treino" fica fora da tela
- **Passos:** celular deitado (780×360) → Hoje → Treinei.
- **Obtido:** o conteúdo tem 572px num sheet de 316px, o dedo não rola (`scrollTop 0`) e o botão fica em y=493 (fora). Com fonte grande do sistema, acontece até em pé no iPhone SE. Print: `shots/paisagem-sheet.png`.
- **Causa:** `src/index.css:351` (`touch-action: none` no `.sheet-card` inteiro).
- **Correção:** `touch-action: none` só no `.grab`; o card fica com `touch-action: pan-y`.

### 15. Trocar de aba apaga a rolagem e o rascunho do comentário
- **Passos:** Feed → rola até um post → começa a digitar um comentário → vai pro Hoje → volta.
- **Obtido:** volta pro topo (`673 → 0`) e o texto some. Chromium e WebKit.
- **Causa:** `src/App.tsx:130` (`key={tab}` remonta a aba inteira).
- **Correção:** guardar o `scrollTop` por aba num ref e restaurar no mount (`useLayoutEffect`). O rascunho pode subir pro App (ou ir pro `sessionStorage`).

### 16. "Semana N" no Feed sai uma a menos (e "Semana 0" na primeira semana) (código)
- **O que acontece:** compara a segunda 00:00 com `first + 'T12:00'`, então a diferença fica 12h a menos e o `floor` perde uma semana. No demo (1º check-in há 7 semanas, esta é a 8ª) aparece "Semana 7". Quando o primeiro check-in é desta semana, aparece **"Semana 0"**.
- **Causa:** `src/Feed.tsx:12`.
- **Correção:** `Math.round((monday() - new Date(first + 'T00:00')) / (7*864e5)) + 1`.

## BAIXO

17. **Regras ± não avisam erro.** `setLimit` (src/Eu.tsx:57-62) ignora o `{ error }`: o número muda na tela e não volta. Correção: ler o erro, desfazer o mutate e mostrar toast.
18. **Erro do banco engole o xingamento.** Há um toast só: se o upsert falha, "Não salvou: …" substitui "ESTOUROU O LIMITE" na hora (src/Hoje.tsx:29). Com o banco ok, o aviso aparece certo (testado). Correção: no erro, mostrar o toast depois do roast, ou não sobrescrever um `roast`.
19. **Editor de foto minúsculo em paisagem.** A caixa fica 75×100px (src/Cropper.tsx:27, `(innerHeight - 260) * aspect`). Print: `shots/chromium-780x360-29-crop-paisagem.png`. Correção: piso mínimo (`Math.max(200, …)`) ou layout em linha quando `innerWidth > innerHeight`.
20. **URLs assinadas valem 6h** (src/lib.ts:103). Com o app aberto em primeiro plano por mais de 6h sem nenhum evento realtime, as fotos quebram até voltar do segundo plano. Correção: recarregar as URLs num timer de ~5h, ou no `onError` da `<img>`.
21. **Nota do check-in não dá pra apagar.** `note.trim() || existing?.note` (src/CheckIn.tsx:110): se apagar o texto ao repostar, volta a nota antiga.
22. **Peso do Perfil não aparece no Feed.** O Feed só usa `weight_kg` se não houver nenhum check-in com peso (src/Feed.tsx:26). Atualizar o "Peso atual" no Perfil não muda o card do Feed. Confirmar se é a intenção.
23. **Login com "Confirm email" ligado no Supabase.** O `signUp` volta sem sessão e sem erro; o botão volta e nada acontece (src/Login.tsx:19-21). Conferir no painel se a confirmação está desligada (deve estar, já que funcionou pros dois). Se não estiver, tratar `!r.data.session`.
24. **Só dá pra marcar a semana atual.** Na segunda não dá pra lançar o domingo esquecido (src/Hoje.tsx, `weekDays()`). Decisão de produto.
25. **Botão voltar do Android** com o check-in, o editor ou um sheet aberto fecha o app inteiro (não há `history.pushState`). Correção: dar `pushState` ao abrir e fechar no `popstate`.
26. **Arquivos órfãos no Storage.** Cada avatar novo é um arquivo novo e o antigo nunca é apagado (src/Eu.tsx), e um check-in que falha no upsert deixa fotos enviadas sem dono (src/CheckIn.tsx:100-110).

## O que passou (sem bug)
- Documento sempre do tamanho da tela, nada desloca pro lado, dock visível e no lugar em todas as abas e telas, inclusive depois de 40 deslizes rápidos e misturados e em paisagem.
- Tocar nas abas; deslizar pelo cabeçalho/área neutra passa por todas e volta (borda segura); diagonal mais vertical não troca de aba; rolagem vertical funciona nas 4 abas.
- Antes/depois arrastável; gráfico com dedo (não troca de aba); replay play/pausa/slider/velocidade 1→2→4→1; Ricardo/Gabriel/Lado a lado; ângulo sem foto mostra "sem foto".
- Hoje: semana começa na segunda, dias futuros bloqueados, Treinei → sheet → seleciona/deseleciona → marcar → desmarcar, Furei liga/desliga, + até estourar mostra "ESTOUROU O LIMITE" (com o banco ok), − não fica negativo.
- Check-in: câmera falhando mostra o aviso + "galeria"; editor (girar, zoom, arrastar, cancelar, usar); 3 ângulos avançam sozinhos; régua; nota; soltar antes do fim cancela; câmera falsa → 3-2-1 → editor.
- Perfil: campos refletem na hora, IMC certo, salvar avisa erro, limites 0..14.
- Aviso de instalar: aparece, "agora não" esconde, não volta no mesmo dia, volta depois de 24h.
- Voltar do segundo plano: sem erro.

## Não deu pra testar aqui
- O teclado real do iOS/Android com `body` fixo. O iOS costuma empurrar layouts `position:fixed` quando o teclado abre: testar à mão o campo de comentário e os campos do Perfil no iPhone.
- O `touch-action` real do Safari iOS (o WebKit de desktop não tem toque nativo; lá o bot usa eventos sintéticos).
- Câmera real, vibração, login, realtime e Storage de verdade (só revisão de código, itens 6, 7, 12, 13, 20, 23, 26).
