// ─────────────────────────────────────────────────────────────────────────────
// O MOTIVO DO BLOQUEIO, À VISTA — o padrão para "por que este botão está
// apagado?".
//
// PORQUÊ. As telas já escrevem o motivo, mas quase sempre no `title` do botão
// desabilitado: não aparece no toque, some para quem não para o ponteiro em
// cima e (até 16/09) nem aparecia no <Button> da base, que desligava o
// ponteiro quando `disabled`. Botão apagado sem frase ao lado lê-se como
// sistema quebrado.
//
// USO — a frase logo abaixo (ou ao lado) do controle, ligada a ele:
//
//   const id = useId();
//   <Button disabled={!pode} aria-describedby={!pode ? id : undefined}>Enviar</Button>
//   {!pode && <MotivoBloqueio id={id}>Só a Solicitação envia a lista.</MotivoBloqueio>}
//
// Só aparece quando há bloqueio — motivo de algo que está liberado é ruído.
// A frase diz O QUE falta e, quando existir, QUEM destrava ("um administrador
// pode reabrir o evento"); nunca só "Não permitido".
// ─────────────────────────────────────────────────────────────────────────────
import { Lock } from "lucide-react";

interface MotivoBloqueioProps {
  /** Alvo do `aria-describedby` do controle bloqueado. */
  id?: string;
  children: React.ReactNode;
  /** Alinhamento da linha; "end" para botões encostados à direita. */
  alinhar?: "start" | "center" | "end";
}

export function MotivoBloqueio({ id, children, alinhar = "start" }: MotivoBloqueioProps) {
  return (
    <p
      id={id}
      data-testid="motivo-bloqueio"
      style={{
        display: "flex", alignItems: "flex-start", gap: 6,
        justifyContent: alinhar === "end" ? "flex-end" : alinhar === "center" ? "center" : "flex-start",
        margin: "6px 0 0", fontSize: 12, lineHeight: 1.45,
        // #57534e: texto de 12px pede 4,5:1 — o cinza #746e69 fica no limite
        // e esta é a frase que responde a dúvida, não um metadado.
        color: "#57534e", textAlign: alinhar === "end" ? "right" : alinhar === "center" ? "center" : "left",
      }}
    >
      <Lock aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2, color: "#746e69" }} />
      <span>{children}</span>
    </p>
  );
}
