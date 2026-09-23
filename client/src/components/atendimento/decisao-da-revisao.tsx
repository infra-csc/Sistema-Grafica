// ─────────────────────────────────────────────────────────────────────────────
// A COLUNA DA DECISÃO no modal de revisão: o que se DECIDE, patrocinador a
// patrocinador, o "Adicionar patrocinador" do admin e o rodapé da fila.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle, ChevronRight, Loader2, PlusCircle, RotateCcw } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { alvo } from "@/hooks/use-mobile";
import { FS, R, T, N, TOM } from "@/lib/theme";
import { LinhaDeDecisao, type PropsDaLinhaDeDecisao } from "./linha-de-decisao";
import type { AcoesDoAtendimento } from "./use-atendimento-acoes";
import type { CandidatoAPatrocinador, Patrocinador, PecaAtendimento, VinculoDoEvento } from "./tipos";

export function DecisaoDaRevisao({
  dialogSponsors, allDecided, allApproved, loadingSponsorApprovals, setDialogOpen, reviewQueue, goToAdjacentItem,
  vinculosDoEvento, sponsorsDoEvento, sponsors, buscaPatrocinador, setBuscaPatrocinador, addPatrocinadorAberto,
  setAddPatrocinadorAberto, addingPatrocinadorId, adicionarPatrocinador, sponsorApproveMutation, ...daLinha
}: {
  dialogSponsors: Patrocinador[];
  allDecided: boolean;
  allApproved: boolean;
  loadingSponsorApprovals: boolean;
  setDialogOpen: Dispatch<SetStateAction<boolean>>;
  reviewQueue: PecaAtendimento[];
  goToAdjacentItem: (dir: 1 | -1) => void;
  vinculosDoEvento: VinculoDoEvento[];
  sponsorsDoEvento: Patrocinador[];
  sponsors: Patrocinador[];
  buscaPatrocinador: string;
  setBuscaPatrocinador: Dispatch<SetStateAction<string>>;
  addPatrocinadorAberto: boolean;
  setAddPatrocinadorAberto: Dispatch<SetStateAction<boolean>>;
  addingPatrocinadorId: string | null;
  adicionarPatrocinador: (sp: CandidatoAPatrocinador) => void;
  sponsorApproveMutation: AcoesDoAtendimento["sponsorApproveMutation"];
} & Omit<PropsDaLinhaDeDecisao, "sponsor">) {
  const { canDecide, user, isMobile, dedo, tamBotao, selectedItem, pecaRecemAberta, decisaoTravada } = daLinha;
  return (
    <div style={{
      borderLeft: `1px solid ${N.n3}`,
      backgroundColor: "rgba(250,250,249,0.5)",
      display: "flex", flexDirection: "column", minWidth: 0,
    }}>
      <div style={{ padding: 24, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          {/* Aprovações por Patrocinador */}
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: T.second, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
              Decisão
            </h4>

            {/* MODO CONSULTA escrito (rodada 4): os botões apareciam
                esmaecidos e o porquê morava no `title` de cada um —
                no celular, em lugar nenhum. */}
            {!canDecide && (
              <p data-testid="decisao-modo-consulta" style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: 8, backgroundColor: N.n2, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.strong, lineHeight: 1.5 }}>
                <b style={{ fontWeight: 700 }}>Modo consulta.</b> Aprovar e reprovar é do Atendimento e dos administradores — aqui você acompanha quem já decidiu.
              </p>
            )}

            {allDecided && !allApproved && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                backgroundColor: T.bg, border: `1px solid ${T.border}`,
              }}>
                <RotateCcw style={{ width: 14, height: 14, color: T.second, flexShrink: 0 }} />
                <p style={{ fontSize: 13, color: T.apoio, margin: 0, fontWeight: 500 }}>
                  {/* "E agora?" respondido (rodada 4): a peça não pede
                      nada de você até a nova arte chegar. */}
                  Nada a decidir nesta peça agora — a Arte está preparando a nova versão e você é avisado quando ela chegar.
                </p>
              </div>
            )}
            {allApproved && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`,
              }}>
                <CheckCircle style={{ width: 14, height: 14, color: TOM.sucesso.text, flexShrink: 0 }} />
                <p style={{ fontSize: 13, color: TOM.sucesso.text, margin: 0, fontWeight: 600 }}>
                  Todos os patrocinadores aprovaram este ativo.
                </p>
              </div>
            )}

            {loadingSponsorApprovals ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Loader2 style={{ width: 20, height: 20, color: T.muted }} className="animate-spin" />
              </div>
            ) : dialogSponsors.length === 0 ? (
              <p style={{ fontSize: 13, color: T.second }}>Nenhum patrocinador vinculado</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {dialogSponsors.map((sponsor) => (
                  <LinhaDeDecisao key={sponsor.id} sponsor={sponsor} {...daLinha} />
                ))}
              </div>
            )}

            {/* ── ADICIONAR PATROCINADOR — SÓ ADMIN ──
                A arte pode carregar uma marca que ninguém
                vinculou (caso #2801, Crystal): sem a linha, não
                há o que aprovar. O admin corrige daqui, sem ir à
                tela de Vincular. O servidor cria a linha
                pendente junto com o vínculo. */}
            {user?.role === "admin" && (() => {
              const jaNaRodada = new Set(dialogSponsors.map((s) => s.id));
              const idsDoEvento = new Set(vinculosDoEvento.map((v) => v.sponsorId));
              // DO EVENTO primeiro; o resto do catálogo entra pela
              // busca (147 nomes não viram lista). O bloco não some
              // mais quando o evento está completo — a marca da arte
              // pode ser justamente a que falta no evento (Crystal).
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
                <div style={{ marginTop: 14, borderTop: `1px dashed ${T.border}`, paddingTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setAddPatrocinadorAberto(v => !v)}
                    aria-expanded={addPatrocinadorAberto}
                    data-testid="button-add-patrocinador"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, color: T.second, cursor: "pointer" }}
                  >
                    <PlusCircle style={{ width: 13, height: 13 }} />
                    Adicionar patrocinador{doEvento.length > 0 ? ` (${doEvento.length} do evento)` : " — buscar no catálogo"} · admin
                  </button>
                  {addPatrocinadorAberto && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      <p style={{ margin: 0, fontSize: 11, color: T.second, lineHeight: 1.45 }}>
                        Para quando a arte carrega uma marca que não foi vinculada. O patrocinador entra como "Aguardando decisão"; um de fora do evento é vinculado ao evento junto.
                      </p>
                      <input
                        value={buscaPatrocinador}
                        onChange={(e) => setBuscaPatrocinador(e.target.value)}
                        placeholder="Buscar no catálogo (ex.: Crystal)…"
                        aria-label="Buscar patrocinador no catálogo"
                        data-testid="input-busca-patrocinador"
                        style={{ height: alvo(34, dedo), borderRadius: R.md, border: `1px solid ${T.bdark}`, padding: "0 10px", fontSize: isMobile ? FS.lead : FS.body, fontFamily: "inherit", color: T.text, backgroundColor: T.surface }}
                      />
                      {termo.length >= 2 && doCatalogo.length === 0 && (
                        <p style={{ margin: 0, fontSize: 11.5, color: T.second }}>Nada no catálogo com "{buscaPatrocinador.trim()}" fora desta rodada.</p>
                      )}
                      {candidatos.map((sp) => (
                        <div key={sp.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {sp.name}
                            {sp.foraDoEvento && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: TOM.alerta.text, textTransform: "uppercase" }}>fora do evento</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => adicionarPatrocinador(sp)}
                            disabled={!!addingPatrocinadorId}
                            data-testid={`button-add-patrocinador-${sp.id}`}
                            style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "none", backgroundColor: addingPatrocinadorId === sp.id ? T.border : T.text, color: addingPatrocinadorId === sp.id ? T.apoio : T.surface, fontSize: 12, fontWeight: 700, cursor: addingPatrocinadorId ? "wait" : "pointer", whiteSpace: "nowrap" }}
                          >
                            {addingPatrocinadorId === sp.id ? "Adicionando…" : "Adicionar"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
      </div>

      {/* RODAPÉ DENTRO DA COLUNA DE DECISÃO.

          Ele atravessava as três colunas no pé do modal, longe da
          lista de patrocinadores que os botões afetam. Aqui ele
          fecha a coluna a que pertence, e a arte à esquerda fica
          com a altura inteira.

          PRÓXIMA PEÇA é a novidade: a fila já existia (a navegação
          no cabeçalho), mas depois de decidir a pessoa tinha de
          subir até o canto para continuar — ou fechar e reencontrar
          a próxima na lista. Em tinta porque, numa fila, seguir é a
          ação principal.

          "Aprovar para todos" perdeu o preenchimento laranja e a
          sombra colorida: ele decide a peça inteira de uma vez e
          estava mais convidativo que as decisões por patrocinador
          logo acima, que são o caminho normal. */}
      <div style={{
        padding: '12px 24px', borderTop: `1px solid ${N.n3}`,
        backgroundColor: T.surface, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <Botao
          variante="fantasma"
          tamanho={tamBotao}
          onClick={() => setDialogOpen(false)}
          style={{ marginRight: 'auto' }}
        >
          Fechar
        </Botao>

        {/* Atalho de peça inteira: só enquanto há decisões em
            aberto. Antes aparecia justamente quando allApproved — e
            o servidor devolvia 409, porque o item já tinha saído de
            awaiting_sponsor_approval.

            O "Reprovar Ativo" FOI EMBORA (decisão do dono, 17/08):
            reprovar a peça inteira e reprovar por patrocinador eram
            duas portas para o MESMO fato e levavam a peça para
            lugares diferentes — a individual a deixava em
            "Aguardando aprovação" e ela caía na aba Correção; esta
            a jogava para "Aguardando envio", no meio de 1.120 peças
            que nunca tinham sido enviadas. A Arte perdia a diferença
            entre RETRABALHO e trabalho novo — foi assim que a #1527
            se escondeu. */}
        {dialogSponsors.length > 0 && !allApproved && !allDecided && (
          <Botao
            variante="secundario"
            tamanho={tamBotao}
            icone={CheckCircle}
            carregando={sponsorApproveMutation.isPending}
            onClick={() => { if (!decisaoTravada()) sponsorApproveMutation.mutate(selectedItem.id); }}
            disabled={!canDecide || pecaRecemAberta}
            title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : `Aprova ${selectedItem.displayId} para TODOS os patrocinadores de uma vez`}
            data-testid="button-approve-item"
          >
            Aprovar para todos
          </Botao>
        )}

        {(() => {
          const qIdx = reviewQueue.findIndex((i) => i.id === selectedItem.id);
          const hasNext = qIdx >= 0 && qIdx < reviewQueue.length - 1;
          if (!hasNext) return null;
          return (
            <Botao
              variante="primario"
              tamanho={tamBotao}
              onClick={() => goToAdjacentItem(1)}
              data-testid="button-next-item-footer"
              title="Abrir a próxima peça da fila sem voltar para a lista"
            >
              Próxima peça
              <ChevronRight aria-hidden="true" style={{ width: 14, height: 14 }} />
            </Botao>
          );
        })()}
      </div>
    </div>
  );
}
