// ─────────────────────────────────────────────────────────────────────────────
// O SELO "OPERANDO: GILMAR · TROCAR" NO TOPO DO APP (login compartilhado, 21/10).
//
// A troca é o fluxo principal (almoço, troca de turno): o "Trocar" fica SEMPRE
// à vista, num toque, e abre "Quem está na máquina?" sem tirar quem está —
// ele continua até o próximo digitar o PIN dele. O nome abre o menu com as
// saídas: "Sair para o almoço" e "Encerrar meu turno" tiram o operador na hora
// (o login compartilhado continua aberto) e a trilha registra a saída.
// ─────────────────────────────────────────────────────────────────────────────
import { ArrowLeftRight, ChevronDown, Coffee, LogOut, Loader2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FONT, FS, FW, R, T, TOM, ESCURO } from "@/lib/theme";
import { userInitials } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAcoesDoOperador } from "@/hooks/use-operador";
import type { EstadoDosOperadores } from "@shared/operadores";

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function SeloDoOperador({ atual, onTrocar }: {
  atual: NonNullable<EstadoDosOperadores["atual"]>;
  onTrocar: () => void;
}) {
  const { toast } = useToast();
  const { sair } = useAcoesDoOperador();
  const desde = HORA.format(new Date(atual.entrouEm));

  const sairPor = (motivo: "almoco" | "fim-do-turno") => {
    sair.mutate(motivo, {
      onSuccess: () => toast({ variant: "success", title: motivo === "almoco" ? `Bom almoço, ${atual.nome}` : `Turno de ${atual.nome} encerrado`, description: "A máquina ficou livre: quem chegar toca no nome e digita o PIN." }),
      onError: (e: Error) => toast({ variant: "destructive", title: "Não foi possível sair", description: e.message }),
    });
  };

  return (
    <div data-testid="selo-operador" role="group" aria-label={`Operando: ${atual.nome}`}
      style={{ display: "inline-flex", alignItems: "stretch", flexShrink: 0, border: `1px solid ${TOM.laranja.border}`, borderRadius: R.pill, backgroundColor: TOM.laranja.bg, overflow: "hidden" }}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" data-testid="selo-operador-nome" className="csc-selo-operador h-9 max-md:h-11"
            aria-label={`Operando: ${atual.nome} — abrir opções de saída`}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0 8px 0 5px", background: "transparent", border: "none", cursor: "pointer", color: TOM.laranja.text, fontFamily: FONT.corpo }}>
            <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", backgroundColor: ESCURO.fundo, color: ESCURO.foco, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.display, fontSize: FS.small, fontWeight: FW.forte, flexShrink: 0 }}>
              {userInitials(atual.nome)}
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1, minWidth: 0 }}>
              <span className="hidden lg:inline" style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.12em", textTransform: "uppercase" }}>Operando</span>
              <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text, whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{atual.nome}</span>
            </span>
            <ChevronDown aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} style={{ minWidth: 252, padding: 6, borderRadius: R.lg }}>
          <DropdownMenuLabel style={{ padding: "8px 8px 10px" }}>
            <span style={{ display: "block", fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{atual.nome} está na máquina</span>
            <span style={{ display: "block", fontSize: FS.small, fontWeight: FW.corpo, color: T.second, marginTop: 2 }}>desde as {desde} · tudo fica com o nome dele no histórico</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="csc-menu-item" data-testid="menu-trocar-operador" onSelect={onTrocar}>
            <ArrowLeftRight aria-hidden="true" />
            Trocar de operador
          </DropdownMenuItem>
          <DropdownMenuItem className="csc-menu-item" data-testid="menu-sair-almoco" disabled={sair.isPending} onSelect={() => sairPor("almoco")}>
            {sair.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Coffee aria-hidden="true" />}
            Sair para o almoço
          </DropdownMenuItem>
          <DropdownMenuItem className="csc-menu-item" data-testid="menu-encerrar-turno" disabled={sair.isPending} onSelect={() => sairPor("fim-do-turno")}>
            <LogOut aria-hidden="true" />
            Encerrar meu turno
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span aria-hidden="true" style={{ width: 1, backgroundColor: TOM.laranja.border }} />
      <button type="button" data-testid="selo-operador-trocar" onClick={onTrocar} className="csc-selo-operador h-9 max-md:h-11"
        aria-label="Trocar de operador"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px 0 10px", background: "transparent", border: "none", cursor: "pointer", color: TOM.laranja.text, fontFamily: FONT.corpo, fontSize: FS.body, fontWeight: FW.forte }}>
        <ArrowLeftRight aria-hidden="true" style={{ width: 15, height: 15, flexShrink: 0 }} />
        <span className="hidden sm:inline">Trocar</span>
      </button>
    </div>
  );
}
