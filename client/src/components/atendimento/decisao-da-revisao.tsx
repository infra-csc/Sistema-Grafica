// ─────────────────────────────────────────────────────────────────────────────
// A COLUNA DA DECISÃO no modal de revisão: o que se DECIDE, patrocinador a
// patrocinador, o "Adicionar patrocinador" do admin e o rodapé da fila.
//
// DUAS PARTES EXPORTADAS (29/09): `ListaDaDecisao` (o que se decide) e
// `RodapeDaDecisao` (Fechar · Aprovar para todos · Próxima peça). No desktop
// elas formam a coluna da direita (`DecisaoDaRevisao`); no celular a lista
// entra logo abaixo da arte e o rodapé fica FIXO no pé do modal, fora da
// rolagem — antes ele morava no fim da coluna de decisão, que no celular
// vinha depois de especificações, arquivos e histórico inteiros.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { AlertTriangle, CheckCircle, ChevronRight, Eye, PlusCircle, RotateCcw, Search } from "lucide-react";
import { fmtRelative } from "@/components/prazos/tokens";
import { Botao } from "@/components/ui/botao";
import { alvo } from "@/hooks/use-mobile";
import { FS, FW, R, T, N, TOM } from "@/lib/theme";
import { letra, rotuloDeSecao } from "./estilos";
import { KBD, posicaoNaFila } from "./regras";
import { FichaDaPeca } from "./leitura-da-revisao";
import { LinhaDeDecisao, type PropsDaLinhaDeDecisao } from "./linha-de-decisao";
import type { AcoesDoAtendimento } from "./use-atendimento-acoes";
import type { CandidatoAPatrocinador, Patrocinador, PecaAtendimento, VinculoDoEvento } from "./tipos";

/** Faixa de aviso da coluna: um desenho só para os quatro recados. */
function Aviso({ tom, icone: Icone, children, testId }: {
  tom: "neutro" | "sucesso" | "alerta";
  icone: typeof CheckCircle;
  children: ReactNode;
  testId?: string;
}) {
  const c = tom === "sucesso" ? { bg: TOM.sucesso.bg, borda: TOM.sucesso.border, texto: TOM.sucesso.text, icone: TOM.sucesso.text }
    : tom === "alerta" ? { bg: TOM.alerta.bg, borda: TOM.alerta.border, texto: T.strong, icone: TOM.alerta.text }
    : { bg: N.n2, borda: T.border, texto: T.strong, icone: T.second };
  return (
    <div data-testid={testId} className="atd-entrar" style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '11px 14px', borderRadius: R.md, marginBottom: 14,
      backgroundColor: c.bg, border: `1px solid ${c.borda}`,
    }}>
      <Icone aria-hidden="true" style={{ width: 15, height: 15, color: c.icone, flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: FS.body, color: c.texto, margin: 0, lineHeight: 1.5, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

type PropsDaLista = {
  dialogSponsors: Patrocinador[];
  allDecided: boolean;
  allApproved: boolean;
  loadingSponsorApprovals: boolean;
  vinculosDoEvento: VinculoDoEvento[];
  sponsorsDoEvento: Patrocinador[];
  sponsors: Patrocinador[];
  buscaPatrocinador: string;
  setBuscaPatrocinador: Dispatch<SetStateAction<string>>;
  addPatrocinadorAberto: boolean;
  setAddPatrocinadorAberto: Dispatch<SetStateAction<boolean>>;
  addingPatrocinadorId: string | null;
  adicionarPatrocinador: (sp: CandidatoAPatrocinador) => void;
  /** Celular: menos respiro em volta. */
  compacta?: boolean;
  /** A leitura das decisões falhou: diz isso e oferece tentar de novo. */
  falhaNasDecisoes?: boolean;
  /** Empilhado: o "Aprovar para todos" mora logo abaixo dos patrocinadores. */
  acaoDaPecaInteira?: ReactNode;
  aoTentarDeNovoDecisoes?: () => void;
} & Omit<PropsDaLinhaDeDecisao, "sponsor">;

/** O que se decide: os avisos, um patrocinador por linha e o "Adicionar" do admin. */
export function ListaDaDecisao({
  dialogSponsors, allDecided, allApproved, loadingSponsorApprovals, vinculosDoEvento, sponsorsDoEvento, sponsors,
  buscaPatrocinador, setBuscaPatrocinador, addPatrocinadorAberto, setAddPatrocinadorAberto, addingPatrocinadorId,
  adicionarPatrocinador, compacta = false, falhaNasDecisoes = false, aoTentarDeNovoDecisoes, acaoDaPecaInteira, ...daLinha
}: PropsDaLista) {
  const { canDecide, user, isMobile, dedo, selectedItem, sponsorApprovals } = daLinha;
  const toque = isMobile || dedo;
  // Quantos já decidiram, dos que esta peça tem — o mesmo critério do
  // `allDecided` (aprovado, reprovado ou com a Arte).
  const decididos = dialogSponsors.filter(s => {
    const st = sponsorApprovals.find(ap => ap.sponsorId === s.id)?.status;
    return st === 'approved' || st === 'rejected' || st === 'awaiting_arte';
  }).length;
  const comVersaoNova = dialogSponsors.filter(s => sponsorApprovals.find(ap => ap.sponsorId === s.id)?.status === 'new_version_pending');
  const desde = selectedItem.approvalThumbUpdatedAt
    ? fmtRelative(new Date(selectedItem.approvalThumbUpdatedAt).toISOString(), Date.now())
    : null;

  return (
    <div style={{ padding: compacta ? '20px 16px' : 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <h4 style={rotuloDeSecao(toque)}>
          Decisão
        </h4>
        {!loadingSponsorApprovals && dialogSponsors.length > 0 && (
          <span data-testid="decisao-progresso" style={{ fontSize: letra(FS.meta, toque), color: T.second, fontVariantNumeric: 'tabular-nums' }}>
            <strong style={{ color: T.text, fontWeight: FW.forte }}>{decididos}</strong> de {dialogSponsors.length} {dialogSponsors.length === 1 ? 'decidido' : 'decididos'}
          </span>
        )}
      </div>

      {/* ERRO não é vazio: sem este aviso, a falha de leitura aparecia como
          "todos aguardando decisão" — e a pessoa decidia sobre um estado que
          não tinha sido lido. */}
      {falhaNasDecisoes && !loadingSponsorApprovals && (
        <div role="alert" data-testid="decisoes-falharam" style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '11px 14px', borderRadius: R.md, marginBottom: 14,
          backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`,
        }}>
          <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, color: TOM.perigo.text, flexShrink: 0 }} />
          <span style={{ flex: '1 1 180px', fontSize: FS.body, color: TOM.perigo.text, lineHeight: 1.45 }}>
            <strong style={{ fontWeight: FW.forte }}>Não foi possível ler as decisões desta peça.</strong> O que aparece abaixo pode não ser o estado atual.
          </span>
          {aoTentarDeNovoDecisoes && (
            <Botao variante="perigoSecundario" tamanho={dedo ? "toque" : "sm"} onClick={aoTentarDeNovoDecisoes} data-testid="button-retry-decisoes">
              Tentar de novo
            </Botao>
          )}
        </div>
      )}

      {/* MODO CONSULTA escrito (rodada 4): os botões apareciam
          esmaecidos e o porquê morava no `title` de cada um —
          no celular, em lugar nenhum. */}
      {!canDecide && (
        <Aviso tom="neutro" icone={Eye} testId="decisao-modo-consulta">
          <b style={{ fontWeight: FW.forte }}>Modo consulta.</b> Aprovar e reprovar é do Atendimento e dos administradores — aqui você acompanha quem já decidiu.
        </Aviso>
      )}

      {/* VERSÃO NOVA À FRENTE (29/09). A Arte devolve eventos inteiros de uma
          vez (21 peças do Night Run Curitiba numa manhã): a peça que chega
          assim precisa dizer, antes de tudo, que a arte na tela é NOVA e
          quem decide de novo. Cada linha abaixo lembra o que foi pedido. */}
      {!loadingSponsorApprovals && comVersaoNova.length > 0 && (
        <Aviso tom="alerta" icone={RotateCcw} testId="aviso-versao-nova">
          <strong style={{ fontWeight: FW.forte, color: TOM.alerta.text }}>Versão nova da arte</strong>
          {desde ? <> · enviada {desde}</> : null}
          <span style={{ display: 'block', marginTop: 2, color: T.apoio }}>
            Decide{comVersaoNova.length === 1 ? '' : 'm'} de novo: {comVersaoNova.map(s => s.name).join(', ')}.
          </span>
        </Aviso>
      )}

      {allDecided && !allApproved && (
        <Aviso tom="neutro" icone={RotateCcw}>
          {/* "E agora?" respondido (rodada 4): a peça não pede nada de
              você até a nova arte chegar. */}
          Nada a decidir nesta peça agora — a Arte está preparando a nova versão e você é avisado quando ela chegar.
        </Aviso>
      )}
      {allApproved && (
        <Aviso tom="sucesso" icone={CheckCircle}>
          <span style={{ fontWeight: FW.medio }}>Todos os patrocinadores aprovaram este ativo.</span>
        </Aviso>
      )}

      {loadingSponsorApprovals ? (
        // SILHUETA das linhas, não um spinner solto: o lugar dos
        // patrocinadores já aparece, e a troca não dá solavanco.
        <div aria-busy="true" aria-label="Carregando as decisões" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1].map(i => (
            <div key={i} className="animate-pulse" style={{ height: 62, borderRadius: R.lg, backgroundColor: N.n2, border: `1px solid ${N.n3}` }} />
          ))}
        </div>
      ) : dialogSponsors.length === 0 ? (
        <p style={{ margin: 0, padding: '14px 16px', borderRadius: R.lg, border: `1px dashed ${T.border}`, fontSize: letra(FS.body, toque), color: T.second, backgroundColor: T.surface }}>
          Nenhum patrocinador vinculado
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dialogSponsors.map((sponsor) => (
            <LinhaDeDecisao key={sponsor.id} sponsor={sponsor} {...daLinha} />
          ))}
          {acaoDaPecaInteira}
        </div>
      )}

      {/* ── ADICIONAR PATROCINADOR — SÓ ADMIN ──
          A arte pode carregar uma marca que ninguém vinculou (caso #2801,
          Crystal): sem a linha, não há o que aprovar. O admin corrige daqui,
          sem ir à tela de Vincular. O servidor cria a linha pendente junto
          com o vínculo. */}
      {user?.role === "admin" && (() => {
        const jaNaRodada = new Set(dialogSponsors.map((s) => s.id));
        const idsDoEvento = new Set(vinculosDoEvento.map((v) => v.sponsorId));
        // DO EVENTO primeiro; o resto do catálogo entra pela busca (147
        // nomes não viram lista). O bloco não some quando o evento está
        // completo — a marca da arte pode ser justamente a que falta.
        const doEvento = sponsorsDoEvento.filter((s) => !jaNaRodada.has(s.id));
        const termo = buscaPatrocinador.trim().toLowerCase();
        const doCatalogo = termo.length >= 2
          ? sponsors
              .filter((s) => !jaNaRodada.has(s.id) && !idsDoEvento.has(s.id) && String(s.name ?? "").toLowerCase().includes(termo))
              .slice(0, 8)
          : [];
        const candidatos = [
          ...doEvento.map((s): CandidatoAPatrocinador => ({ ...s, foraDoEvento: false })),
          ...doCatalogo.map((s): CandidatoAPatrocinador => ({ ...s, foraDoEvento: true })),
        ];
        return (
          <div style={{ marginTop: 16, borderTop: `1px dashed ${T.border}`, paddingTop: 10 }}>
            {/* A AÇÃO ESCRITA COMO AÇÃO (29/09): era uma frase só —
                "Adicionar patrocinador — buscar no catálogo · admin" —, e o
                "· admin" parecia lixo de texto. Agora o botão diz o verbo, a
                linha de apoio diz de onde vem o patrocinador, e o papel é um
                selo discreto. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Botao
                variante="secundario"
                tamanho={dedo ? "toque" : "sm"}
                icone={PlusCircle}
                onClick={() => setAddPatrocinadorAberto(v => !v)}
                aria-expanded={addPatrocinadorAberto}
                data-testid="button-add-patrocinador"
              >
                Adicionar patrocinador
              </Botao>
              <span style={{ fontSize: letra(FS.small, toque), color: T.second }}>
                {doEvento.length > 0 ? `${doEvento.length} do evento, ou busca no catálogo` : 'busca no catálogo'}
              </span>
              <span title="Só administradores veem esta ação" style={{ marginLeft: 'auto', fontSize: letra(FS.micro, toque), fontWeight: FW.rotulo, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.second, padding: '2px 7px', borderRadius: R.pill, border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
                Só admin
              </span>
            </div>
            {addPatrocinadorAberto && (
              <div className="atd-entrar" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                <p style={{ margin: 0, fontSize: letra(FS.small, toque), color: T.second, lineHeight: 1.5 }}>
                  Para quando a arte carrega uma marca que não foi vinculada. O patrocinador entra como "Aguardando decisão"; um de fora do evento é vinculado ao evento junto.
                </p>
                <div style={{ position: 'relative' }}>
                  <Search aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T.second, pointerEvents: 'none' }} />
                  <input
                    value={buscaPatrocinador}
                    onChange={(e) => setBuscaPatrocinador(e.target.value)}
                    placeholder="Buscar no catálogo (ex.: Crystal)…"
                    aria-label="Buscar patrocinador no catálogo"
                    data-testid="input-busca-patrocinador"
                    style={{ width: '100%', boxSizing: 'border-box', height: alvo(36, dedo), borderRadius: R.md, border: `1px solid ${T.bdark}`, padding: "0 10px 0 30px", fontSize: isMobile ? FS.lead : FS.body, fontFamily: "inherit", color: T.text, backgroundColor: T.surface }}
                  />
                </div>
                {termo.length >= 2 && doCatalogo.length === 0 && (
                  <p style={{ margin: 0, fontSize: letra(11.5, toque), color: T.second }}>Nada no catálogo com "{buscaPatrocinador.trim()}" fora desta rodada.</p>
                )}
                {candidatos.map((sp) => (
                  <div key={sp.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 12px", borderRadius: R.md, backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
                    <span style={{ flex: '1 1 0%', minWidth: 0, fontSize: letra(FS.body, toque), fontWeight: FW.medio, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sp.name}
                      {sp.foraDoEvento && <span style={{ marginLeft: 6, fontSize: letra(FS.micro, toque), fontWeight: FW.forte, color: TOM.alerta.text, textTransform: "uppercase", letterSpacing: '0.04em' }}>fora do evento</span>}
                    </span>
                    <Botao
                      variante="secundarioForte"
                      tamanho={dedo ? "toque" : "sm"}
                      onClick={() => adicionarPatrocinador(sp)}
                      disabled={!!addingPatrocinadorId}
                      carregando={addingPatrocinadorId === sp.id}
                      data-testid={`button-add-patrocinador-${sp.id}`}
                    >
                      {addingPatrocinadorId === sp.id ? "Adicionando…" : "Adicionar"}
                    </Botao>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/**
 * "APROVAR PARA TODOS" — o atalho da peça inteira. Um componente só, porque
 * mora em dois lugares: no rodapé do desktop e, empilhado, logo abaixo dos
 * patrocinadores (no rodapé fixo do celular não cabiam três botões).
 *
 * Só enquanto há decisões em aberto. Antes aparecia justamente quando
 * allApproved — e o servidor devolvia 409, porque o item já tinha saído de
 * awaiting_sponsor_approval.
 *
 * O "Reprovar Ativo" FOI EMBORA (decisão do dono, 17/08):
 * reprovar a peça inteira e reprovar por patrocinador eram
 * duas portas para o MESMO fato e levavam a peça para
 * lugares diferentes — a individual a deixava em
 * "Aguardando aprovação" e ela caía na aba Correção; esta
 * a jogava para "Aguardando envio", no meio de 1.120 peças
 * que nunca tinham sido enviadas. A Arte perdia a diferença
 * entre RETRABALHO e trabalho novo — foi assim que a #1527
 * se escondeu.
 */
export function BotaoAprovarTodos({
  dialogSponsors, allDecided, allApproved, sponsorApproveMutation, selectedItem, canDecide, tamBotao, pecaRecemAberta, decisaoTravada, larguraCheia = false,
}: {
  dialogSponsors: Patrocinador[];
  allDecided: boolean;
  allApproved: boolean;
  sponsorApproveMutation: AcoesDoAtendimento["sponsorApproveMutation"];
  selectedItem: PecaAtendimento;
  canDecide: boolean;
  tamBotao: PropsDaLinhaDeDecisao["tamBotao"];
  pecaRecemAberta: boolean;
  decisaoTravada: () => boolean;
  larguraCheia?: boolean;
}) {
  if (!(dialogSponsors.length > 0 && !allApproved && !allDecided)) return null;
  return (
    <Botao
      variante="secundario"
      tamanho={tamBotao}
      icone={CheckCircle}
      larguraCheia={larguraCheia}
      carregando={sponsorApproveMutation.isPending}
      onClick={() => { if (!decisaoTravada()) sponsorApproveMutation.mutate(selectedItem.id); }}
      disabled={!canDecide || pecaRecemAberta}
      title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : `Aprova ${selectedItem.displayId} para TODOS os patrocinadores de uma vez`}
      data-testid="button-approve-item"
    >
      Aprovar para todos
    </Botao>
  );
}

/**
 * O RODAPÉ DA FILA — uma barra de ações do sistema (29/09, 2ª passada).
 *
 * DESKTOP: largura inteira do modal. À esquerda, discreta, a dica do
 * teclado; à direita, AGRUPADAS na ordem da casa, Fechar (secundário) ·
 * Aprovar para todos · Próxima peça (primário). Antes o "Fechar" era texto
 * solto na ponta esquerda, longe das outras ações.
 *
 * CELULAR/EMPILHADO: fixo no pé do modal, fora da rolagem, com o recorte
 * seguro — Fechar SEMPRE à vista ao lado de Próxima peça. O "Aprovar para
 * todos" desce para logo abaixo dos patrocinadores (ver BotaoAprovarTodos).
 *
 * PRÓXIMA PEÇA em tinta: numa fila, seguir é a ação principal.
 */
export function RodapeDaDecisao({
  dialogSponsors, allDecided, allApproved, setDialogOpen, reviewQueue, goToAdjacentItem, sponsorApproveMutation,
  selectedItem, canDecide, tamBotao, pecaRecemAberta, decisaoTravada, fixoNoCelular = false, dedo = false,
}: {
  dialogSponsors: Patrocinador[];
  allDecided: boolean;
  allApproved: boolean;
  setDialogOpen: Dispatch<SetStateAction<boolean>>;
  reviewQueue: PecaAtendimento[];
  goToAdjacentItem: (dir: 1 | -1) => void;
  sponsorApproveMutation: AcoesDoAtendimento["sponsorApproveMutation"];
  selectedItem: PecaAtendimento;
  canDecide: boolean;
  tamBotao: PropsDaLinhaDeDecisao["tamBotao"];
  pecaRecemAberta: boolean;
  decisaoTravada: () => boolean;
  /** Celular/empilhado: rodapé fixo no pé do modal, botões em linha cheia. */
  fixoNoCelular?: boolean;
  /** Ponteiro de dedo: sem a dica de teclado. */
  dedo?: boolean;
}) {
  const { temProxima: hasNext, total } = posicaoNaFila(reviewQueue, selectedItem.id);
  const fechar = (
    <Botao
      variante="secundario"
      tamanho={tamBotao}
      onClick={() => setDialogOpen(false)}
      data-testid="button-close-footer"
      title="Fechar (Esc)"
      style={fixoNoCelular ? { flex: hasNext ? '0 0 auto' : '1 1 0%', padding: '0 18px' } : undefined}
    >
      Fechar
    </Botao>
  );
  const proxima = hasNext && (
    <Botao
      variante="primario"
      tamanho={tamBotao}
      onClick={() => goToAdjacentItem(1)}
      data-testid="button-next-item-footer"
      title="Abrir a próxima peça da fila sem voltar para a lista (→)"
      aria-keyshortcuts="ArrowRight"
      style={fixoNoCelular ? { flex: '1 1 0%' } : undefined}
    >
      Próxima peça
      <ChevronRight aria-hidden="true" style={{ width: 15, height: 15 }} />
    </Botao>
  );

  if (fixoNoCelular) {
    return (
      <div
        data-testid="rodape-da-decisao"
        style={{
          // LONGOS: o atalho `padding` com env() some no parser do jsdom.
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
          paddingTop: 10, paddingLeft: 12, paddingRight: 12, paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
          borderTop: `1px solid ${T.border}`, backgroundColor: T.surface, boxShadow: "0 -4px 16px rgba(28,25,23,0.06)",
        }}
      >
        {fechar}
        {proxima}
      </div>
    );
  }

  return (
    <div
      data-testid="rodape-da-decisao"
      style={{
        padding: '12px 20px 12px 24px', borderTop: `1px solid ${N.n3}`,
        backgroundColor: T.surface,
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}
    >
      {/* A dica do teclado, só onde há teclado. */}
      {!dedo && total > 1 && (
        <span data-testid="dica-atalhos" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: FS.small, color: T.second, marginRight: 'auto' }}>
          <kbd style={KBD}>←</kbd><kbd style={KBD}>→</kbd> peça anterior / próxima
          <span style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: T.bdark, margin: '0 4px' }} />
          <kbd style={KBD}>Esc</kbd> fechar
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {fechar}
        <BotaoAprovarTodos
          dialogSponsors={dialogSponsors} allDecided={allDecided} allApproved={allApproved}
          sponsorApproveMutation={sponsorApproveMutation} selectedItem={selectedItem} canDecide={canDecide}
          tamBotao={tamBotao} pecaRecemAberta={pecaRecemAberta} decisaoTravada={decisaoTravada}
        />
        {proxima}
      </div>
    </div>
  );
}

/**
 * A coluna da direita no desktop: a DECISÃO e, logo abaixo, a FICHA da peça
 * (especificações e arquivos). Com um patrocinador só, a coluna era um
 * cartão no topo e 400px de branco até o rodapé; agora o que se decide vem
 * com o que a peça é — dados que já estavam no modal, na coluna errada.
 */
export function DecisaoDaRevisao({ thumbUrl, finalUrl, ...daLista }: PropsDaLista & {
  thumbUrl: string | null;
  finalUrl: string | null;
}) {
  const toque = daLista.isMobile || daLista.dedo;
  return (
    <div style={{
      borderLeft: `1px solid ${N.n3}`,
      backgroundColor: T.bg,
      display: "flex", flexDirection: "column", minWidth: 0,
    }}>
      <div style={{ overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
        <ListaDaDecisao {...daLista} />
        <div style={{ borderTop: `1px solid ${N.n3}` }}>
          <FichaDaPeca selectedItem={daLista.selectedItem} thumbUrl={thumbUrl} finalUrl={finalUrl} toque={toque} />
        </div>
      </div>
    </div>
  );
}
