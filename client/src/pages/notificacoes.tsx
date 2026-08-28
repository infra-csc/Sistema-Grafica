// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICAÇÕES — a central do admin (dono, 27/08: "ver o que mandou e o que
// não mandou" + "administrar quem recebe, bem amplo").
//
// Três blocos, na ordem em que o admin pergunta:
//   1. AS CHAVES — produção, canal de e-mail, remetente, GESTAO/REVISAO
//      ligadas. É a resposta de 80% dos "ninguém recebeu".
//   2. QUEM RECEBE — as três listas nomeadas, editáveis aqui (banco). Sem
//      linha no banco vale a lista padrão do código; a primeira adição COPIA
//      o padrão junto, então "adicionar alguém" nunca significa "remover
//      todo mundo". As regras (Arte por papel, executivo por vínculo) são
//      mostradas como texto — regra não se edita em lista.
//   3. O QUE SAIU — a grade dia × edição dos dois avisos automáticos, lida da
//      trilha. Célula sem registro em horário já passado = "não rodou", que é
//      exatamente o caso que não aparecia em lugar nenhum (o das 18h de 27/08).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Send, Loader2, X, Plus, CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Edicao {
  aviso: "gestao" | "revisao";
  dia: string;
  hora: number;
  manual: boolean;
  status: "enviado" | "vazio" | "falhou" | "simulado" | "outro";
  desfecho: string;
  em: string;
}
interface Canal {
  canal: "gestao" | "revisao" | "book";
  titulo: string;
  descricao: string;
  padrao: string[];
  personalizados: { id: string; email: string; addedBy?: string | null }[];
  emUso: string[];
}
interface Retrato {
  agora: { dia: string; hora: number; minuto: number };
  horarios: number[];
  chaves: {
    producao: boolean; emailsLigados: boolean; simulacao: boolean;
    remetente: string | null; gestaoLigada: boolean; revisaoLigada: boolean;
  };
  canais: Canal[];
  edicoes: Edicao[];
}

const DIAS_NA_GRADE = 10;

/** Dias da grade: hoje para trás, no fuso da operação (o `dia` vem do servidor). */
function diasAteHoje(diaDeHoje: string, n: number): string[] {
  const [y, m, d] = diaDeHoje.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(base);
    dt.setUTCDate(dt.getUTCDate() - i);
    return dt.toISOString().slice(0, 10);
  });
}

const rotuloDia = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export default function Notificacoes() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Retrato>({ queryKey: ["/api/admin/notificacoes"] });
  const [novoEmail, setNovoEmail] = useState<Record<string, string>>({});

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/notificacoes"] });

  const adicionar = useMutation({
    mutationFn: async ({ canal, email }: { canal: string; email: string }) =>
      (await apiRequest("POST", "/api/admin/notificacoes/destinatarios", { canal, email })).json(),
    onSuccess: (_r, v) => {
      invalidar();
      setNovoEmail((p) => ({ ...p, [v.canal]: "" }));
      toast({ title: "Destinatário adicionado", description: v.email });
    },
    onError: (e: any) => toast({ title: "Não deu para adicionar", description: e.message, variant: "destructive" }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/notificacoes/destinatarios/${id}`)).json(),
    onSuccess: (r: any) => {
      invalidar();
      toast({ title: "Destinatário removido", description: r?.removido?.email });
    },
    onError: (e: any) => toast({ title: "Não deu para remover", description: e.message, variant: "destructive" }),
  });

  const disparar = useMutation({
    mutationFn: async (aviso: "gestao" | "revisao") =>
      (await apiRequest("POST", `/api/${aviso}/digest/enviar`, {})).json(),
    onSuccess: (r: any) => {
      invalidar();
      toast({
        title: r.status === "enviado" ? "Aviso enviado" : "Aviso não enviado",
        description: r.mensagem,
        variant: r.status === "enviado" || r.status === "sem-fila" ? undefined : "destructive",
      });
    },
    onError: (e: any) => toast({ title: "Falha no disparo", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return <p style={{ padding: 40, fontSize: 14, color: "#78716c" }}>Carregando o retrato dos avisos…</p>;
  }

  const { chaves, canais, edicoes, agora, horarios } = data;
  const dias = diasAteHoje(agora.dia, DIAS_NA_GRADE);

  const edicaoDe = (aviso: string, dia: string, hora: number, manual: boolean) =>
    edicoes.find((e) => e.aviso === aviso && e.dia === dia && e.hora === hora && e.manual === manual);
  const manuaisDoDia = (dia: string) => edicoes.filter((e) => e.dia === dia && e.manual);

  const chip = (ok: boolean, rotuloOk: string, rotuloRuim: string, neutroSeFalse = false) => (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 12px", borderRadius: 999,
      fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
      background: ok ? "#f0fdf4" : neutroSeFalse ? "#fafaf9" : "#fef2f2",
      border: `1px solid ${ok ? "#bbf7d0" : neutroSeFalse ? "#e7e5e4" : "#fecaca"}`,
      color: ok ? "#15803d" : neutroSeFalse ? "#57534e" : "#b91c1c",
    }}>
      {ok ? <CheckCircle2 style={{ width: 13, height: 13 }} /> : <AlertTriangle style={{ width: 13, height: 13 }} />}
      {ok ? rotuloOk : rotuloRuim}
    </span>
  );

  const celula = (aviso: "gestao" | "revisao", dia: string, hora: number) => {
    const e = edicaoDe(aviso, dia, hora, false);
    const jaPassou = dia < agora.dia || (dia === agora.dia && hora <= agora.hora);
    let texto = "—", bg = "transparent", cor = "#a8a29e", title = "Horário ainda não chegou";
    if (e) {
      if (e.status === "enviado") { texto = "Enviado"; bg = "#f0fdf4"; cor = "#15803d"; }
      else if (e.status === "vazio") { texto = "Fila vazia"; bg = "#fafaf9"; cor = "#78716c"; }
      else if (e.status === "simulado") { texto = "Simulação"; bg = "#eff6ff"; cor = "#1d4ed8"; }
      else { texto = "Falhou"; bg = "#fef2f2"; cor = "#b91c1c"; }
      title = e.desfecho;
    } else if (jaPassou) {
      texto = "Não rodou"; bg = "#fffbeb"; cor = "#92400e";
      title = "Nenhum registro na trilha para esta edição — relógio parado (deploy dormindo/reiniciando), chave desligada, ou versão anterior a 27/08 (que não registrava fila vazia).";
    }
    return (
      <td key={`${aviso}-${hora}`} title={title} data-testid={`celula-${aviso}-${dia}-${hora}`}
        style={{ padding: "7px 10px", textAlign: "center", borderLeft: "1px solid #f5f4f2" }}>
        <span style={{ display: "inline-block", minWidth: 74, padding: "3px 8px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, background: bg, color: cor }}>
          {texto}
        </span>
      </td>
    );
  };

  return (
    <div style={{ backgroundColor: "#fafaf9", minHeight: "100%", padding: "18px 18px 64px" }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 4px", fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 800, color: "#1c1917", display: "flex", alignItems: "center", gap: 8 }}>
          <Bell style={{ width: 18, height: 18, color: "#c2410c" }} /> Notificações
        </h1>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#57534e" }}>
          O que o sistema manda por e-mail, para quem, e o que saiu (ou não) em cada edição.
        </p>

        {/* ── 1 · As chaves ── */}
        <div data-testid="chaves-dos-avisos" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "#fff", border: "1px solid #e7e5e4", marginBottom: 16 }}>
          {chip(chaves.producao, "Ambiente de produção", "Fora de produção — nada é enviado daqui", true)}
          {chip(chaves.emailsLigados, "Canal de e-mail ligado", "Canal de e-mail DESLIGADO")}
          {chip(!chaves.simulacao, "Envio real", "MODO SIMULAÇÃO — monta e não envia")}
          {chip(!!chaves.remetente, `Remetente: ${chaves.remetente ?? ""}`, "SEM remetente configurado")}
          {chip(chaves.gestaoLigada, "Acompanhamento ligado", "Acompanhamento DESLIGADO (GESTAO_DIGEST_ENABLED)")}
          {chip(chaves.revisaoLigada, "Aviso da revisão ligado", "Aviso da revisão DESLIGADO (REVISAO_DIGEST_ENABLED)")}
        </div>

        {/* ── 2 · Quem recebe ── */}
        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#57534e" }}>Quem recebe</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 20 }}>
          {canais.map((c) => {
            const usandoPadrao = c.personalizados.length === 0;
            return (
              <div key={c.canal} data-testid={`canal-${c.canal}`} style={{ padding: "14px 14px 12px", borderRadius: 10, background: "#fff", border: "1px solid #e7e5e4", display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "#1c1917" }}>{c.titulo}</p>
                  <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#78716c", lineHeight: 1.45 }}>{c.descricao}</p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {usandoPadrao
                    ? c.padrao.map((email) => (
                        <span key={email} title="Lista padrão do sistema — adicione alguém para a lista virar editável" style={{ display: "inline-flex", alignItems: "center", height: 25, padding: "0 9px", borderRadius: 999, background: "#fafaf9", border: "1px dashed #d6d3d1", color: "#57534e", fontSize: 11.5, fontWeight: 600 }}>
                          {email}
                        </span>
                      ))
                    : c.personalizados.map((p) => (
                        <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 25, padding: "0 4px 0 9px", borderRadius: 999, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 11.5, fontWeight: 600 }}>
                          {p.email}
                          <button type="button" onClick={() => remover.mutate(p.id)} disabled={remover.isPending}
                            title={`Remover ${p.email} deste aviso`} aria-label={`Remover ${p.email}`}
                            data-testid={`remover-${p.id}`}
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 17, height: 17, borderRadius: 999, border: "none", background: "transparent", color: "#c2410c", cursor: "pointer", padding: 0 }}>
                            <X style={{ width: 11, height: 11 }} />
                          </button>
                        </span>
                      ))}
                </div>
                <p style={{ margin: 0, fontSize: 10.5, color: "#a8a29e" }}>
                  {usandoPadrao
                    ? "Lista padrão do sistema. Ao adicionar o primeiro e-mail, ela é copiada para cá e vira editável."
                    : "Lista editável — é ela que vale, no lugar da padrão."}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const email = (novoEmail[c.canal] ?? "").trim();
                    if (email) adicionar.mutate({ canal: c.canal, email });
                  }}
                  style={{ display: "flex", gap: 6, marginTop: "auto" }}
                >
                  <input
                    type="email"
                    value={novoEmail[c.canal] ?? ""}
                    onChange={(e) => setNovoEmail((p) => ({ ...p, [c.canal]: e.target.value }))}
                    placeholder="nome.sobrenome@nortemkt.com"
                    data-testid={`input-destinatario-${c.canal}`}
                    style={{ flex: 1, minWidth: 0, height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid #e7e5e4", fontSize: 12.5, color: "#1c1917", background: "#fff" }}
                  />
                  <button type="submit" disabled={adicionar.isPending || !(novoEmail[c.canal] ?? "").trim()}
                    data-testid={`adicionar-destinatario-${c.canal}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 11px", borderRadius: 8, border: "none", background: "#1c1917", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    <Plus style={{ width: 12, height: 12 }} /> Adicionar
                  </button>
                </form>
              </div>
            );
          })}
        </div>

        {/* ── 3 · O que saiu ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#57534e" }}>
            O que saiu — últimos {DIAS_NA_GRADE} dias
          </p>
          <span style={{ flex: 1 }} />
          {(["gestao", "revisao"] as const).map((aviso) => (
            <button key={aviso} type="button"
              onClick={() => disparar.mutate(aviso)}
              disabled={disparar.isPending}
              data-testid={`disparar-${aviso}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", color: "#1c1917", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {disparar.isPending ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Send style={{ width: 12, height: 12 }} />}
              {aviso === "gestao" ? "Mandar acompanhamento agora" : "Mandar aviso da revisão agora"}
            </button>
          ))}
        </div>
        <div style={{ borderRadius: 10, background: "#fff", border: "1px solid #e7e5e4", overflowX: "auto" }}>
          <table data-testid="grade-de-envios" style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e7e5e4" }}>
                <th rowSpan={2} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 800, color: "#57534e", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em" }}>Dia</th>
                <th colSpan={horarios.length} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 800, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.06em", borderLeft: "1px solid #f5f4f2" }}>Acompanhamento</th>
                <th colSpan={horarios.length} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 800, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.06em", borderLeft: "1px solid #f5f4f2" }}>Revisão</th>
                <th rowSpan={2} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 800, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.06em", borderLeft: "1px solid #f5f4f2" }}>Manuais</th>
              </tr>
              <tr style={{ borderBottom: "1px solid #e7e5e4" }}>
                {(["gestao", "revisao"] as const).flatMap((aviso) =>
                  horarios.map((h) => (
                    <th key={`${aviso}-${h}`} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#78716c", borderLeft: "1px solid #f5f4f2" }}>{h}h</th>
                  )))}
              </tr>
            </thead>
            <tbody>
              {dias.map((dia) => (
                <tr key={dia} style={{ borderBottom: "1px solid #f5f4f2" }}>
                  <td style={{ padding: "7px 12px", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: dia === agora.dia ? 800 : 500, color: dia === agora.dia ? "#1c1917" : "#57534e", whiteSpace: "nowrap" }}>
                    {rotuloDia(dia)}{dia === agora.dia ? " · hoje" : ""}
                  </td>
                  {horarios.map((h) => celula("gestao", dia, h))}
                  {horarios.map((h) => celula("revisao", dia, h))}
                  <td style={{ padding: "7px 12px", borderLeft: "1px solid #f5f4f2", whiteSpace: "nowrap" }}>
                    {manuaisDoDia(dia).length === 0
                      ? <span style={{ color: "#d6d3d1", fontSize: 11.5 }}>—</span>
                      : manuaisDoDia(dia).map((e, i) => (
                          <span key={i} title={e.desfecho} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 4, padding: "2px 7px", borderRadius: 6, fontSize: 10.5, fontWeight: 700, background: e.status === "enviado" ? "#f0fdf4" : "#fef2f2", color: e.status === "enviado" ? "#15803d" : "#b91c1c", border: "1px solid #e7e5e4" }}>
                            {e.aviso === "gestao" ? "Acomp." : "Revisão"} {e.hora}h
                          </span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#a8a29e", display: "flex", alignItems: "center", gap: 5 }}>
          <MinusCircle style={{ width: 11, height: 11 }} />
          "Não rodou" antes de 27/08 pode ser só a versão antiga, que não registrava edição de fila vazia — desde 27/08, toda edição deixa rastro.
        </p>
      </div>
    </div>
  );
}
