# Design system do NORTE — o que usar, e quando

Os componentes abaixo vivem em `client/src/components/ui/` e têm nome em
português. Eles substituem padrões que cada tela reimplementava sozinha; a
lista existe para a migração das telas grandes.

A cor, a medida e o raio vêm sempre de `client/src/lib/theme.ts`
(`T`, `N`, `TOM`, `FS`, `R`, `H`, `FW`, `FONT`, `SHADOW`, `MOTION`).
O `index.css` espelha os mesmos valores em CSS vars — use as vars só no que
estilo inline não alcança: `:hover`, `:focus-visible`, `:disabled`, media query
e tema escuro. **Mudou um, muda o outro** (há teste guardando isso).

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

**Laranja da marca:** `T.accent` (`#f97316`) é decoração. Para texto, ou para
fundo sob texto branco, `T.accentText` (`#c2410c`).

**Resto:** `FS` (10 a 26, piso de 10), `FONT.corpo|display|mono`, `FW`,
`R.sm|md|lg|xl|pill`, `H.sm|md|toque`, `SHADOW.sm|md|lg`, `MOTION`.

Para saber o que ainda falta migrar num arquivo:
`node scripts/mapa-de-cores.mjs client/src/pages/arte.tsx` — ele lista cada hex
com o token sugerido e o porquê, e **não escreve nada**.

---

## `<Botao>` — `ui/botao.tsx`

```tsx
<Botao variante="primario|secundario|fantasma|perigo"
       tamanho="sm|md|toque" carregando motivo icone={Plus} larguraCheia
       alinharMotivo="start|center|end" {...propsDeButton}>Rótulo</Botao>
```

Escolha pela **função**, não pelo peso visual: `primario` é a ação que a tela
existe para fazer (uma por bloco); `perigo` é só a ação **destrutiva** —
cancelar não é perigo.

- `carregando` desabilita e troca o ícone por spinner (dois cliques rápidos já
  geraram dois pedidos de peça iguais).
- `motivo` é **por que** está desabilitado e aparece como texto **visível**
  abaixo do botão, ligado por `aria-describedby`. Não use `title` para isso:
  no celular não há hover.
- Hover/active/foco/desabilitado vêm da classe `.ds-botao` no `index.css`.
  Não escreva `onMouseEnter` trocando `style.backgroundColor` — é o padrão que
  este componente veio substituir (~200 pares de handlers, nenhum cobrindo
  teclado).

## `<CabecalhoDaPagina>` — `ui/cabecalho-da-pagina.tsx`

```tsx
<CabecalhoDaPagina titulo subtitulo frescor acoes icone id />
```

Ordem fixa: **onde estou** (título) · **como está** (subtítulo + frescor) ·
**o que posso fazer** (ações). O subtítulo carrega o ESTADO ("12 modelos, 3 com
pendência"), não uma paráfrase do título.
`frescor` é `ReactNode` — a tela passa o próprio carimbo (`lib/painel-frescor`).

## `<Abas>` e `<Segmentado>` — `ui/abas.tsx`

```tsx
<Abas itens={[{ id, rotulo, contador?, tom?, desabilitada? }]}
      ativo aoTrocar rotuloDaLista prefixoDeTestId />
<Segmentado ... tamanho="sm|md" />
```

`<Abas>` troca o **conteúdo** (sublinhado). `<Segmentado>` troca a **forma de
ver** o mesmo conteúdo (tabela/cartão, dia/semana).
O `contador` usa a cor do `tom` da própria aba: um `3` vermelho ao lado de
"Atrasados" é a notícia antes da palavra — e passe a contagem em `contador`, não
colada no rótulo entre parênteses.
Setas/Home/End e o *roving tabindex* estão **aqui**, uma vez só — não
reimplemente na tela.

**Migrando:** `prefixoDeTestId="tab-versoes"` faz os botões saírem como
`tab-versoes-todos`, então a tela adota o componente sem quebrar os seletores
que os testes dela já usam. O padrão é `aba-` / `segmento-`.

## `<CartaoKpi>` — `ui/cartao-kpi.tsx`

```tsx
<CartaoKpi tom valor rotulo sub icone ativo onClick compacto />
```

Com `onClick` vira `<button aria-pressed>` de verdade — os cartões são a barra
de filtros de várias telas, e como `<div onClick>` o teclado não os alcançava.
Ativo muda borda + faixa + `aria-pressed`, não só a cor.

## `<Selo>` — `ui/selo.tsx`

```tsx
<Selo tom cores={{bg,text,border,dot?}} forma="pilula|retangulo"
      tamanho="sm|md" ponto icone />
```

É a **forma**; a cor de status vem de `status.ts` via `cores`.
`<StatusPill>` e `<StatusBadge>` são este componente — o primeiro com bolinha e
rótulo curto, o segundo com ícone e rótulo responsivo. Não crie um terceiro.

## `<EstadoVazio>`, `<EstadoErro>`, `<Esqueleto>` — `ui/estados.tsx`

```tsx
<EstadoVazio icone titulo descricao acao compacto />
<EstadoErro titulo detalhe aoTentarDeNovo compacto />
<Esqueleto variante="lista|cartoes|tabela" linhas rotulo />
```

**Vazio e erro não são a mesma coisa.** Vazio é normal e pede o próximo passo;
erro é falha, diz o que falhou e oferece tentar de novo. Quem vê "Nenhum
resultado" depois de a rede cair conclui que os dados sumiram.
O esqueleto imita o que vem, para o dado chegar sem solavanco.

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
