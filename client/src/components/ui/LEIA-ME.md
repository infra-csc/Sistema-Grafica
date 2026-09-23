# Design system do NORTE — o que usar, e quando

Os componentes abaixo vivem em `client/src/components/ui/` e têm nome em
português. Eles substituem padrões que cada tela reimplementava sozinha; a
lista existe para a migração das telas grandes.

A cor, a medida e o raio vêm sempre de `client/src/lib/theme.ts`
(`T`, `N`, `TOM`, `TOM_FORTE`, `ESCURO`, `FS`, `R`, `H`, `FW`, `FONT`, `SHADOW`,
`MOTION`). O `index.css` espelha os mesmos valores em CSS vars — use as vars só
no que estilo inline não alcança: `:hover`, `:focus-visible`, `:disabled`,
media query e tema escuro. **Mudou um, muda o outro** (há teste guardando isso).

Cor de STATUS DE PEÇA não mora no theme: mora em `client/src/lib/status.ts`.

---

## Os tokens, em uma tela

**Neutros** `N.n0 … N.n10`, do papel ao texto. `T` dá nome aos mais usados:

| token | vale | papel |
|---|---|---|
| `T.surface` | n0 `#ffffff` | card, modal, linha par |
| `T.bg` | n1 `#fafaf9` | fundo de página |
| `T.low` | `#f3f4f3` | bloco rebaixado dentro de card |
| `N.n2` | `#f5f5f4` | superfície sutil, hover |
| `N.n3` | `#f0efee` | separador, trilho, fundo de campo |
| `T.border` | n4 `#e7e5e4` | **a borda de tudo** |
| `T.bdark` | n5 `#d6d3d1` | borda forte, ícone de vazio |
| `T.muted` | n6 `#a8a29e` | **só ícone/desabilitado — nunca texto** |
| `T.second` | n7 `#746e69` | texto secundário |
| `T.apoio` | n8 `#57534e` | texto de apoio |
| `T.strong` | n9 `#44403c` | texto forte |
| `T.text` | n10 `#1c1917` | texto principal |

**A exceção medida:** `T.second` (n7) passa AA sobre n0, n1, n2 e `T.low`, mas
fica em **4,38:1 sobre `N.n3`**. Onde houver texto de apoio em cima de n3 —
placeholder de campo cinza, rótulo dentro de trilho — use `T.apoio`.

**Semânticos** `TOM.*`, todos vindos da paleta `P` de `status.ts`, cada um com
`{ bg, border, text, dot }`. `text` é AA sobre o próprio `bg`; `dot` é o tom
saturado e **não é cor de texto**.

`sucesso` · `alerta` · `perigo` · `info` · `neutro` · `laranja` · `ceu` ·
`roxo` · `esmeralda` · `turquesa` · `ciano`

**Degrau forte** `TOM_FORTE.*` — as mesmas onze famílias em fundo 100, texto 800
e borda 300: o chip SELECIONADO, a linha marcada, o aviso que não pode sumir no
meio dos selos claros. Pior contraste medido: alerta, 6,37:1. É o que as telas
cravavam como `#fee2e2`/`#991b1b`, `#dcfce7`/`#166534`, `#fef3c7`/`#92400e`.

**Superfície escura** `ESCURO` — o cabeçalho escuro de modal, a barra flutuante
de lote, o topo do Exportar PDF:

| token | vale | papel |
|---|---|---|
| `ESCURO.fundo` | `#1c1917` (n10) | fundo chapado |
| `ESCURO.fundoAlto` | `#2d2926` | 2º ponto do gradiente |
| `ESCURO.gradiente` | `linear-gradient(135deg, …)` | o fundo do `ModalHeader` `work` |
| `ESCURO.texto` | `#fafaf9` | texto (13,8:1 no pior fundo) |
| `ESCURO.apoio` | `#d6d3d1` | subtítulo (9,7:1) — **não** o `#a8a29e` |
| `ESCURO.borda` / `divisor` | `rgba(255,255,255,.12/.06)` | hairline sobre o escuro |
| `ESCURO.realce` / `realceForte` | `rgba(255,255,255,.08/.16)` | controle translúcido, repouso/hover |
| `ESCURO.foco` | `#fb923c` | anel de foco sobre o escuro (o `#ea580c` cai para 2,4 no realce) |

Envolva a superfície escura com `className="ds-sobre-escuro"` e o anel de foco
de tudo lá dentro troca sozinho para `ESCURO.foco`.

**Laranja da marca:** `T.accent` (`#f97316`) é decoração. Para texto, ou para
fundo sob texto branco, `T.accentText` (`#c2410c`).

**Resto:** `FS` (10 a 26, piso de 10), `FONT.corpo|display|mono`, `FW`,
`R.sm|md|lg|xl|pill`, `H.sm|md|toque`, `SHADOW.sm|md|lg`, `MOTION`.

**Tema.** O app é CLARO: `color-scheme: light` no `:root` — o `<select>` aberto,
o calendário nativo e a barra de rolagem não escurecem quando o sistema está em
modo escuro. O bloco `.dark` do `index.css` está **desligado**: nenhum código
aplica a classe. Ele fica COERENTE (escada invertida, semânticos e superfície
escura redefinidos, `color-scheme: dark`) para o dia em que alguém o ligar — e
aí será preciso revisar as cores inline. O hover de controle sem fundo é o
PAPEL `--realce`/`--realce-ativo` (no claro, n2/n3), não `var(--n2)` direto na
regra.

Para saber o que ainda falta migrar num arquivo:
`node scripts/mapa-de-cores.mjs client/src/pages/arte.tsx` — ele lista cada hex
com o token sugerido e o porquê, e **não escreve nada**. Ele já conhece
`TOM_FORTE` (os degraus 100/300/800) e `ESCURO.fundoAlto` (`#2d2926`).

---

## `<Botao>` e `<BotaoLink>` — `ui/botao.tsx`

```tsx
<Botao variante="primario|secundario|secundarioForte|fantasma|perigo|perigoSecundario|claro|claroFantasma"
       tamanho="sm|md|toque" tom="ciano" carregando motivo
       icone={Plus} tamanhoDoIcone={16} larguraCheia
       alinharMotivo="start|center|end" {...propsDeButton}>Rótulo</Botao>

<BotaoLink href="/eventos/1" externo? desabilitado? motivo?
           variante tamanho tom icone tamanhoDoIcone larguraCheia>Abrir</BotaoLink>
```

Escolha pela **função**, não pelo peso visual: `primario` é a ação que a tela
existe para fazer (uma por bloco); `perigo` é só a ação **destrutiva** —
cancelar não é perigo.

- `carregando` desabilita e troca o ícone por spinner (dois cliques rápidos já
  geraram dois pedidos de peça iguais).
- `motivo` é **por que** está desabilitado e aparece como texto **visível**
  abaixo do botão, ligado por `aria-describedby`. Não use `title` para isso:
  no celular não há hover.
- `perigoSecundario` é a destrutiva que NÃO é a ação do bloco ("Remover" numa
  linha, "Excluir" ao lado de "Salvar"): fundo branco, texto e borda vermelhos,
  hover na tinta vermelha clara. `secundarioForte`: borda n5 e texto n10.
- `claro` (branco cheio) e `claroFantasma` (translúcido) são para **fundo
  escuro**. Têm hover e anel de foco próprios — não sobrescreva por `style`.
- `tom` é a cor da ETAPA sem `style`: no `primario` vira o fundo (o `text` do
  TOM; branco sobre qualquer um passa AA, o pior é 5,0:1); no `secundario`,
  `secundarioForte` e `fantasma` vira o texto (e a borda). Ignorado em perigo e
  nas claras — ali a cor É o recado.
- `tamanhoDoIcone` (pd. 14) vale para o ícone e para o spinner — não ponha o
  ícone como filho só para mudar o tamanho.
- `<BotaoLink>` é **um** `<a>` (Link do wouter; `externo` para `<a href>` cru)
  com a mesma classe e o mesmo estilo. Nada de `<Link><Botao/></Link>` nem de
  `<Link className="ds-botao" style={…}>` copiado. `desabilitado` tira o href,
  põe `aria-disabled`, mantém no Tab e mostra o `motivo`.
- Hover/active/foco/desabilitado vêm da classe `.ds-botao` no `index.css`.
  Não escreva `onMouseEnter` trocando `style.backgroundColor` — é o padrão que
  este componente veio substituir (~200 pares de handlers, nenhum cobrindo
  teclado).

## `<CabecalhoDaPagina>` — `ui/cabecalho-da-pagina.tsx`

```tsx
<CabecalhoDaPagina titulo subtitulo frescor acoes icone id
                   testId="title-eventos"            // data-testid do <h1>
                   semMargem | margemInferior={8}    // pd. 20
                   corDoIcone={T.accentText} />
```

Ordem fixa: **onde estou** (título) · **como está** (subtítulo + frescor) ·
**o que posso fazer** (ações). O subtítulo carrega o ESTADO ("12 modelos, 3 com
pendência"), não uma paráfrase do título.
`frescor` é `ReactNode` — a tela passa o próprio carimbo (`lib/painel-frescor`).
`testId` existe porque os testes das telas estão presos a `title-<tela>` e cada
uma envolvia o cabeçalho numa `<div>` só para carregá-lo.

## `<Abas>` e `<Segmentado>` — `ui/abas.tsx`

```tsx
<Abas itens={[{ id, rotulo, contador?, tom?, desabilitada?,
                icone?, title?, idDoElemento?, ariaControls? }]}
      ativo aoTrocar rotuloDaLista prefixoDeTestId
      testId="abas-grafica" style={{ flex: "1 1 auto" }} rolarAteAtiva />
<Segmentado ... tamanho="sm|md|toque" larguraCheia testId style />
```

`<Abas>` troca o **conteúdo** (sublinhado). `<Segmentado>` troca a **forma de
ver** o mesmo conteúdo (tabela/cartão, dia/semana).
O `contador` usa a cor do `tom` da própria aba: um `3` vermelho ao lado de
"Atrasados" é a notícia antes da palavra — e passe a contagem em `contador`, não
colada no rótulo entre parênteses.
Setas/Home/End e o *roving tabindex* estão **aqui**, uma vez só — não
reimplemente na tela.

- `idDoElemento` é o `id` do botão da aba e `ariaControls` o do painel — o par
  que o painel precisa para dizer `aria-labelledby`. Não recoloque por ref.
- `icone` é decorativo (o rótulo continua sendo o nome); `title` é dica de
  ponteiro, não substitui o rótulo.
- `tamanho="toque"` põe o segmento em 44px; `larguraCheia` divide a largura.
- O vão entre abas é **8px** (com 11px de respiro de cada lado: a mesma
  distância entre rótulos de antes), e o anel de foco da aba entra para dentro
  (`.ds-aba`), porque o trilho rola e cortaria o de fora.
- `rolarAteAtiva` traz a aba ativa para a vista no trilho que rola.

**Migrando:** `prefixoDeTestId="tab-versoes"` faz os botões saírem como
`tab-versoes-todos`, e `testId` renomeia o contêiner — a tela adota o
componente sem quebrar os seletores que os testes dela já usam. O padrão é
`aba-` / `segmento-` e `abas` / `segmentado`.

## `<CartaoKpi>` e `<FaixaDeKpis>` — `ui/cartao-kpi.tsx`

```tsx
<CartaoKpi tom cores={{bg,text,border,dot?}} valor rotulo sub icone
           ativo onClick                 // FILTRO: <button aria-pressed>
           href | navegacao + onClick    // NAVEGAÇÃO: <a> ou <button>, sem aria-pressed, com ›
           variante="cartao|celula" compacto
           tendencia={{ valor, direcao: "sobe|desce|estavel", bom?, rotulo? }}
           acaoSecundaria={<Botao …/>}    // rodapé, IRMÃO do botão principal
           ariaLabel title data-testid />
<FaixaDeKpis minimo={150} rotulo="Resumo">…células…</FaixaDeKpis>
```

Com `onClick` vira `<button aria-pressed>` de verdade — os cartões são a barra
de filtros de várias telas, e como `<div onClick>` o teclado não os alcançava.
Ativo muda borda + faixa + `aria-pressed`, não só a cor.

- `cores` vence o `tom` (fúcsia e rosa de `status.ts` não existem no TOM).
- Navegação não é liga/desliga: sem `aria-pressed`, com a seta ›.
- `variante="celula"` tira moldura e raio; dentro de `<FaixaDeKpis>` os
  divisores aparecem certos em qualquer quebra (a faixa recorta a sobra).
- `tendencia` só pinta verde/vermelho quando `bom` diz o que é bom; o leitor de
  tela ouve "Subiu/Caiu/Estável".
- `acaoSecundaria`: a moldura vira `<div>` com o botão principal e o rodapé
  IRMÃOS — nada de botão dentro de botão. O `data-testid` fica no principal; a
  moldura ganha `<id>-moldura` e o rodapé `<id>-acao`.
- O rótulo sobe para 12px e quebra linha no celular (`.ds-kpi-rotulo`), em vez
  de cortar com reticência.

## `<Selo>` — `ui/selo.tsx`

```tsx
<Selo tom cores={{bg,text,border,dot?}} forma="pilula|retangulo"
      tamanho="sm|md" ponto icone />
<Selo cores={CORES_SOBRE_ESCURO}>3 de 12</Selo>   // sobre o cabeçalho escuro
```

É a **forma**; a cor de status vem de `status.ts` via `cores`.
`<StatusPill>` e `<StatusBadge>` são este componente — o primeiro com bolinha e
rótulo curto, o segundo com ícone e rótulo responsivo. Não crie um terceiro.

## `<EstadoVazio>`, `<EstadoErro>`, `<Esqueleto>` — `ui/estados.tsx`

```tsx
<EstadoVazio icone titulo descricao acao compacto tom="sucesso" testId />
<EstadoErro titulo detalhe aoTentarDeNovo compacto
            carregando tamanhoDoBotao="toque" rotuloDoBotao
            testId testIdDoBotao="button-retry-historico" />
<Esqueleto variante="lista|cartoes|tabela" linhas rotulo />
```

**Vazio e erro não são a mesma coisa.** Vazio é normal e pede o próximo passo;
erro é falha, diz o que falhou e oferece tentar de novo. Quem vê "Nenhum
resultado" depois de a rede cair conclui que os dados sumiram.
O esqueleto imita o que vem, para o dado chegar sem solavanco.

`carregando` no erro mantém o botão à vista (spinner, travado) durante o
refetch — sumir com ele parecia defeito. `tom` no vazio pinta o ícone ("tudo em
dia" em verde) com o `text` do tom.

## Casca de modal — `components/modal-shell.tsx`

```tsx
<ModalHeader icon title subtitle variant="work|confirm" tint onClose trailing
             selo={<Selo cores={CORES_SOBRE_ESCURO}>Rascunho</Selo>}
             testIdDoFechar="button-close-modal" />
<ModalFooter fundo={T.bg} style={{ flexDirection: "row" }} data-testid />
```

O X não tem mais `onMouseEnter`: as cores chegam por var (`--fechar-fundo`,
`--fechar-fundo-hover`) e o hover/foco mora no `.modal-fechar` do CSS. O
cabeçalho `work` usa `ESCURO.gradiente` e leva `.ds-sobre-escuro` (anel claro).
O rodapé é `T.surface` por padrão, sem `#fff` cravado.

## `useConfirmar()` — `ui/usar-confirmar.tsx`

```tsx
const { confirmar, dialogo } = useConfirmar();
const ok = await confirmar({ titulo, descricao, confirmar: "Excluir",
                             cancelar: "Manter", perigo: true, icone });
if (!ok) return;
// ... e montar {dialogo} no JSX
```

Substitui `window.confirm`, que é caixa do sistema operacional: ignora o idioma
e a tipografia do app, mostra a URL do servidor acima da pergunta, **trava a
thread** (o modal atrás congela) e oferece "impedir que esta página crie mais
diálogos" — quem marca isso passa a agir sem confirmação nenhuma.

O rótulo do botão diz o **verbo** ("Excluir"), não "OK": quem lê rápido lê o
botão, e "OK" combina igualmente bem com "Excluir?" e com "Manter?".

## Avisos (toast) — `hooks/use-toast` + `ui/toaster.tsx`

Quatro variantes: `success` (= `default`), `warning`, `destructive`.

Use `warning` quando **a ação não aconteceu mas nada quebrou** ("selecione ao
menos uma peça", "o evento já foi encerrado"). `destructive` é falha de
verdade. Das 219 chamadas destrutivas do app, boa parte é aviso — e vermelho
cem vezes por dia ensina o olho a descartar o vermelho.

## Acessibilidade — o que já vem de graça

- **Foco visível** em todos: anel laranja profundo global; para dentro na aba e
  na célula de KPI (`.ds-aba`, `.ds-kpi-principal`); laranja claro sobre o
  escuro (`.ds-sobre-escuro`, `claro`, `claroFantasma`, X do modal escuro).
- **`prefers-reduced-motion`** zera transição e animação (spinner e esqueleto
  inclusos), com 0,01ms para o `transitionend` continuar disparando.
- **44px com `(pointer: coarse)`**: `button`, `[role=button]`, `[role=tab]` e,
  agora, `a.ds-botao` (`<BotaoLink>` e `<CartaoKpi href>`).

---

## Régua da casa (vale para tudo)

- `#f97316` e `#a8a29e` **nunca** como cor de texto (nem como fundo sob texto
  branco). Para laranja legível: `T.accentText`. Para cinza legível: `T.second`.
- Hex com `1px solid` dentro de string vira template: `` `1px solid ${T.border}` ``.
  Mas **classe do Tailwind com valor arbitrário** (`border-[#e7e5e4]`) fica
  literal: ela é lida em tempo de build, e montada em runtime some da folha.
- Alvo de 44px e fonte de 16px em campo no celular.
- Motivo de botão desabilitado **visível**, não só no `title`.
- Comentário em pt-BR, curto, dizendo o **porquê** — nunca `{/* */}` logo
  depois de `return (` nem dentro de ternário.
- A palavra "Pelotão" não existe.

---

## Como substituir os contornos locais

Levantamento de 23/09, por tela. Cada item é um contorno que existe **só**
porque o componente não oferecia a prop; com a prop nova, o contorno sai. Os
testes das telas continuam presos aos mesmos `data-testid` — é para isso que as
props de `testId` existem. As linhas são aproximadas (as telas estão mudando).

**Gráfica (`pages/grafica.tsx`)**
- `CartaoDeEtapaCelular` (~836) e o `TOM_DA_ETAPA` que rebaixava fúcsia/rosa →
  `<CartaoKpi cores={getStatusMeta(…)}>` (o rótulo já sobe para 12px no celular).
- `<span title>` em volta do CartaoKpi (~2916, ~2940) → `title` e `ariaLabel`.
- `<div data-testid="abas-grafica">` → `<Abas testId="abas-grafica">`.
- `<Link className="ds-botao">` (~2811, ~4393) → `<BotaoLink>`.
- `style` com `TOM.perigo.text`/`border` (~265, 276, 4121, 4234, 4902, 5089,
  5917) → `variante="perigoSecundario"`; `T.accentText` (~230) →
  `tom="laranja"`; esmeralda (~4971) → `tom="esmeralda"`; `#dcfce7` (~386) →
  `TOM_FORTE.sucesso.bg`.
- Barras escuras com `rgba(255,255,255,…)` (~3611–3646, ~4380–4410,
  ~5347–5440) → `ESCURO.*` + `claro`/`claroFantasma` + `ds-sobre-escuro`.

**Máquinas (`pages/grafica-maquinas.tsx`)**
- `<h1>` à mão com Printer em `T.accentText` (~1762) → `CabecalhoDaPagina corDoIcone`.
- `<div data-testid="abas-maquinas" style={{overflowX, marginTop:-8}}>` →
  `<Abas testId="abas-maquinas" style={{ marginTop: -8 }}>` (o overflow já é dele).
- `botaoNeutro` em `<Link className="mq-acao">` (~1125, 1768, 1955, 2149,
  2237, 2248) → `<BotaoLink>`; secundários com borda `T.text`/`T.bdark` (~655,
  671, 891, 907, 947, 959, 1096, 1110) → `variante="secundarioForte"`.
- Erros `maquinas-erro`/`resumo-erro` → `<EstadoErro testId tamanhoDoBotao="toque">`;
  vazios `seletor-vazio`, `fila-vazia`, `resumo-vazio`, `diario-vazio` →
  `<EstadoVazio testId>`; `ArrowRight` filho de 12px (~1867) → `tamanhoDoIcone`.

**Painel Geral (`pages/painel-geral.tsx`)**
- `StatusCard` local (~275–420) e o botão irmão absoluto "inclui N rascunhos"
  (~395) → `<CartaoKpi cores ariaLabel title acaoSecundaria>`.
- `<div data-testid="title-painel-geral" style={{marginBottom:-18}}>` →
  `testId` + `margemInferior`.
- "Nada pede atenção agora" à mão (~3004) → `<EstadoVazio tom="sucesso">`.
- `<Link style={{minHeight:H.md, border…}}>` (~4006, ~4045) → `<BotaoLink>`.
- Barra de seleção escura (~3959–3974) → `ESCURO` + `claro`/`claroFantasma`.

**Atendimento (`pages/atendimento.tsx`)**
- `<div ref={…b.id=…; setAttribute('aria-controls')}>` em volta do Segmentado
  (~2015) → `itens[].idDoElemento`/`ariaControls` + `style={{ flexShrink: 0 }}`.
- Placar de 4 células com divisores à mão (~1921–1998) → `<FaixaDeKpis>` +
  `<CartaoKpi variante="celula">`.
- Perigo por `style` (~2537) → `perigoSecundario`;
  `<div data-testid="empty-atendimento">` (~2683) → `<EstadoVazio testId tom="sucesso">`.

**Arte (`pages/arte.tsx`)**
- `<div ref={tablistRef} style={{flex, marginBottom:-1}}>` + `scrollIntoView`
  (~5030, ~690) → `<Abas style rolarAteAtiva>`.
- `<div style={{marginBottom: isMobile ? -8 : -4}}>` (~4431) → `margemInferior`.
- Wrappers de `data-testid` do EstadoErro (~3988) e do vazio `empty-arte`
  (~3317, ~4019) → `testId` + `tom="sucesso"`.
- Perigo por `style` (~4799, 4880, 6942) → `perigoSecundario`; `P.amber.text`
  (~5221) → `tom="alerta"`; (~6985) → `tom="info"`.
- `onMouseEnter` em botões (~2827, 2836, 2869, 2886, 3632, 6910) → `<Botao>`.
- Chip e botão escuros com `rgba` (~3569–3639, ~5062) → `ESCURO` + `claroFantasma`.

**Calendário (`pages/calendario.tsx`)**
- Radiogroup Semana|Mês próprio (~587) → `<Segmentado tamanho="toque" testId>`.
- `<div data-testid="title-calendario">` (~448) → `testId`.
- Retry dentro do `detalhe` (~684–704) → `testIdDoBotao="button-retry-calendar"`
  + `tamanhoDoBotao="toque"`.
- Painel escuro e botão `rgba(255,255,255,0.07)` (~1185–1215) → `ESCURO` +
  `claroFantasma`.

**Eventos (`pages/eventos.tsx`)**
- `<div data-testid="title-eventos" style={{marginBottom:-20}}>` → `testId` + `semMargem`.
- Radiogroup Cartões|Lista com ícones (~3509) → `<Segmentado>` com `itens[].icone`.
- `<Link data-testid="link-caixa-pedidos" style={…}>` (~2508) → `<BotaoLink>`.
- Rodapé de modal com `T.low` (~4049) → `<ModalFooter fundo={T.low}>`.

**Versões (`pages/versoes.tsx`)**
- `BotaoResumo` (~531) → `<CartaoKpi tom title>`.
- `<h1 data-testid="title-versoes">` com ladrilho (~280) → `CabecalhoDaPagina testId corDoIcone`.
- `<div style={{margin:"14px 0 -1px"}}>` em volta do Abas (~365) → `style`.
- `<div data-testid="segmented-modo-comparador">` (~925) → `<Segmentado testId style>`.
- `<a>`/`<Link>` com borda e `vs-hover` (~415, 1028, 1202, 1250) → `<BotaoLink>`.

**Solicitações ao estoque (`pages/solicitacoes-ao-estoque.tsx`)**
- Wrapper `title-…` com `marginBottom:-20` (~486) → `testId` + `semMargem`.
- `sugestoes-erro`, `consultas-erro`, `consultas-vazio` → `testId`.
- Primário/secundário verdes por `style` (~365, ~383) → `tom="sucesso"`.

**Histórico (`pages/historico.tsx`)**
- Retry dentro do `detalhe` com "Tentando…" (~1937–1958) → `testIdDoBotao` +
  `carregando` + `tamanhoDoBotao`.
- Primário `T.accentText` quando há filtro (~1566, ~1884) → `tom="laranja"`.

**Registros (`pages/registros.tsx`)**
- Erro inteiro à mão (~612–620) → `<EstadoErro testIdDoBotao tamanhoDoBotao>`.
- Contadores `stat-*` (~460–488) → `<CartaoKpi cores title>`.
- Lightbox escuro (~1076–1189) → `ESCURO` + `claroFantasma` + `<BotaoLink externo>`.

**Etiquetas (`pages/etiqueta-tubo.tsx`, `pages/etiquetas-evento.tsx`)**
- `<div style={{marginBottom:-20}}>` (tubo ~263, evento ~858) → `semMargem`.
- EstadoErro sem retry + `<Botao tamanho="toque">` por fora (tubo ~277,
  evento ~449) → `aoTentarDeNovo` + `tamanhoDoBotao="toque"` + `testId`.
- `<Link className="etq-foco" style={…}>` (tubo ~258, evento ~458, ~853) → `<BotaoLink>`.
- `TOM.laranja` por `style` (evento ~581) → `tom="laranja"`; borda `T.text`
  (~542) → `secundarioForte`.

**Gestão de Prazos (`pages/gestao-prazos.tsx`, `components/prazos/kpi-card.tsx`)**
- `kpi-card.tsx` inteiro ("por que não é o CartaoKpi": célula sem moldura +
  `TrendArrow`) → `<FaixaDeKpis>` + `<CartaoKpi variante="celula" tendencia>`.
- `linkComoBotao` em `<Link className="ds-botao">` (~976, ~996) → `<BotaoLink>`.
- Pílula âmbar (~1543) → `tom="alerta"`; vazio "tudo em dia" (~1025) → `tom="sucesso"`.

**Análises (`pages/dashboard-analises.tsx`)**
- `<a href>` dentro do `sub` do CartaoKpi (~205–235) → `href` (navegação) ou
  `acaoSecundaria`.
- `<div style={{flexShrink:0}}>` em volta do Segmentado (~1453) → `style`.
- Primário laranja com filtro (~975) → `tom="laranja"`.

**Triagem (`pages/triagem-retorno.tsx`)**
- `botaoModo` nativo com `<Scissors>` (~1008–1016) → `<Segmentado tamanho="toque">`
  com `itens[].icone`.
- `botaoPreset(TOM.sucesso|perigo)` (~1068, ~1072) → `tom` / `perigoSecundario`.
- Wrapper `testId` do EstadoVazio (~856) → `testId`.
- Barra flutuante escura (~1372–1417) → `ESCURO` + `claro`/`claroFantasma`.

**Modais**
- `pages/estoque.tsx` (~241): X refeito no `trailing` só pelo testid →
  `testIdDoFechar="button-close-modal"`. Ícones filhos de 18/15 (~1102–1162) →
  `tamanhoDoIcone`; (~1114) → `perigoSecundario`; rodapé `T.bg` (~1321) →
  `<ModalFooter fundo={T.bg}>`.
- `pages/event-detail.tsx`: botão claro no cabeçalho escuro (~2486) →
  `variante="claro"`; (~666) → `perigoSecundario`; (~2038) → `tom="sucesso"`;
  `<Link className="ds-botao">` (~1988) → `<BotaoLink>`.
- `pages/solicitacao.tsx`: anterior/próxima no `trailing` escuro (~2565–2604) →
  `claroFantasma`; perigo por `style` (~2025, 2949, 2963) → `perigoSecundario`;
  verdes (~1826, 2004, 2911) → `tom="sucesso"`; (~3059) → `tom="alerta"`;
  rodapés `T.bg` (~2859, ~3139) → `<ModalFooter fundo={T.bg}>`.
- `pages/vincular-patrocinadores.tsx`: `<Selo cores={{ bg: "rgba(…)", … }}>` no
  `trailing` (~3205, ~3787) → `selo={<Selo cores={CORES_SOBRE_ESCURO}>}`;
  `<div data-testid="button-retry-items">` (~2191) → `testIdDoBotao`;
  radiogroup com `Calendar`/`Building2` (~2690) → `<Segmentado>` com ícones;
  rodapés `T.bg`/`T.low` (~3342, 3667, 3943) → `fundo`.
- `components/export-pdf-dialog.tsx` (~297–330) e `components/item-details-dialog.tsx`
  (~964): cabeçalho escuro copiado com `#2d2926` → `<ModalHeader>` ou `ESCURO.gradiente`.

**Demais telas e componentes**
- `pages/modelos.tsx` (~201), `components/galpao-fila.tsx` (~430),
  `components/tubos-dialog.tsx` (`BotaoPrimario`, ~219): primário com a cor da
  etapa por `style` → `tom`.
- `pages/notificacoes.tsx` (~562), `components/tubos-dialog.tsx` (~1038),
  `components/kit/painel-do-kit.tsx` (~323),
  `components/pedidos/formulario-do-pedido.tsx` (~188): perigo por `style` →
  `perigoSecundario`.
- `pages/pedidos-de-peca.tsx` (~75) e `pages/notificacoes.tsx` (~150): `<h1>` à
  mão → `<CabecalhoDaPagina testId>`.
- `pages/patrocinadores.tsx` (~381): número-filtro "Sem executivo" → `<CartaoKpi>`;
  rodapé `T.low` (~735) → `fundo`.
- `pages/not-found.tsx` (~56), `pages/relatorio-evento.tsx`, `pages/book-gerador.tsx`,
  `pages/logs-sistema.tsx`: voltar/retry com `<Link>`/`<button>` à mão →
  `<BotaoLink>` / `<EstadoErro>`.
- `components/tubos-dialog.tsx` (~1024, ~1224), `components/grafica/aba-tubos.tsx`
  (~327): `<Link className="ds-botao" style>` → `<BotaoLink>`.
- `components/grafica/aba-tubos.tsx`: `<div data-testid="tubos-segmentos">` (~188)
  e "o Abas não dá id às abas" (~171) → `testId`, `style`, `idDoElemento`/`ariaControls`.
- `components/etiqueta-lista.tsx` (~169): `Segmento` local →
  `<Segmentado tamanho="toque" larguraCheia>`.
- `components/pedidos/detalhe-do-pedido.tsx` (~197), `buscar-arte-dialog.tsx`
  (~270, ~281), `pedidos/lista-de-pedidos.tsx` (~429),
  `triagem/eventos-da-triagem.tsx` (~185): wrappers de `data-testid` →
  `testId`/`testIdDoBotao`/`carregando`.
- Tons fortes cravados → `TOM_FORTE`: `pages/usuarios.tsx` (~123–127),
  `components/estoque-semelhantes-dialog.tsx` (~104–105), `pedidos-do-evento.tsx`
  (~194, ~198), `sponsor-chips.tsx` (~82), `pages/configurar-cotas.tsx` (~23–24),
  `pages/book-gerador.tsx` (~358, ~363).
- Superfícies escuras com `rgba` → `ESCURO`: `components/triagem-modal.tsx`,
  `triagem/quadro-da-triagem.tsx` (~742, ~746), `registros-de-tubos.tsx`
  (~285–297), `pages/login.tsx` (~179–201), `pages/usuarios.tsx` (~812).
- `onMouseEnter` trocando cor em `<button>` que ainda restam: `bulk-item-entry.tsx`,
  `filter-select.tsx`, `notification-bell.tsx`, `painel-geral.tsx` (~1037, ~1054),
  `eventos.tsx` (~2832), `event-detail.tsx` (~2005, 3780, 3801, 3814),
  `solicitacao.tsx` (~2465), `logs-sistema.tsx` (~344, ~525),
  `item-details-dialog.tsx` (~213, 218, 246, 1053) → `<Botao>`/`<BotaoLink>`.
- `server/__tests__/grafica-celular.test.ts`: a exceção do `<Abas>` em
  `vizinhosColados` deixou de ser necessária (o vão agora é 8px) e pode sair.
