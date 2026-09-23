// Seletor de fotos (câmera + galeria) com miniaturas e remoção — o MESMO na
// conferência individual e na conferência em lote.
import { useEffect, useState } from "react";
import { Camera, Check, ImagePlus, Trash2, X } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { useIsMobile } from "@/hooks/use-mobile";
import { FS, FW, N, R, T, TOM } from "@/lib/theme";

export function PhotoPicker({ photos, onAdd, onRemove, onError, label = "Fotos", hint, dense = false, onEnviandoMudou }: {
  photos: string[];
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
  onError: (error: Error) => void;
  label?: string;
  hint?: string;
  dense?: boolean;
  /** Quantos envios estão em andamento (câmera + galeria) — quem confirma espera. */
  onEnviandoMudou?: (emAndamento: number) => void;
}) {
  const [enviando, setEnviando] = useState<Record<string, boolean>>({});
  const emAndamento = Object.values(enviando).filter(Boolean).length;
  useEffect(() => { onEnviandoMudou?.(emAndamento); }, [emAndamento]); // eslint-disable-line react-hooks/exhaustive-deps
  // Saiu da tela no meio do envio: não deixa o "Enviando foto…" preso.
  useEffect(() => () => onEnviandoMudou?.(0), []); // eslint-disable-line react-hooks/exhaustive-deps
  const buttons = [
    { capture: true, Icon: Camera, text: dense ? "Câmera" : "Tirar Foto" },
    { capture: false, Icon: ImagePlus, text: dense ? "Galeria" : "Anexar Fotos" },
  ];
  // Celular: rótulo ≥ 12px (10px maiúsculo não se lê no sol do galpão).
  const noCelular = useIsMobile();
  // Remover foto pergunta antes (o X fica colado na miniatura) — pela caixa
  // do app, não pelo window.confirm do navegador.
  const { confirmar, dialogo } = useConfirmar();
  const pedirRemocao = async (url: string) => {
    const ok = await confirmar({
      titulo: "Remover esta foto?",
      descricao: "Ela sai da lista antes de confirmar; nada foi enviado ainda para a peça.",
      confirmar: "Remover",
      cancelar: "Manter",
      perigo: true,
      icone: Trash2,
    });
    if (ok) onRemove(url);
  };
  return (
    <div>
      {dialogo}
      {/* Rótulo em caixa normal: a caixa-alta de 10px era ruído, não ênfase. */}
      <label style={{ display: "block", fontSize: noCelular ? FS.meta : FS.small, fontWeight: FW.forte, color: T.apoio, marginBottom: 10 }}>
        {label} {hint && <span style={{ color: T.second, fontWeight: FW.corpo }}>{hint}</span>}
        {/* Contador vivo: depois de voltar da câmera, a pessoa precisa saber de
            relance que a foto ENTROU — a miniatura pode estar fora da dobra. */}
        {photos.length > 0 && (
          <span role="status" style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3, color: TOM.sucesso.text, fontWeight: FW.rotulo }}>
            <Check aria-hidden="true" style={{ width: 11, height: 11 }} />
            {photos.length} anexada{photos.length !== 1 ? "s" : ""}
          </span>
        )}
      </label>

      <div style={{ display: "flex", gap: 12 }}>
        {buttons.map(({ capture, Icon, text }) => (
          <div key={text} style={{ flex: 1 }}>
            <ObjectUploader
              {...(capture ? { capture: true } : { multiple: true })}
              maxFileSize={10485760}
              buttonVariant="ghost"
              // min-h: durante o envio o ObjectUploader troca o conteúdo por
              // "Enviando x%" (uma linha) e o botão encolhia de ~64 para ~20px
              // — o layout pulava e o Confirmar mudava de lugar sob o dedo.
              buttonClassName="w-full h-full min-h-[64px] p-0 border-0 hover:bg-transparent"
              onComplete={r => onAdd(r.url)}
              onError={onError}
              onEnviandoMudou={(b) => setEnviando(prev => (prev[text] === b ? prev : { ...prev, [text]: b }))}
            >
              <div style={{ width: "100%", minHeight: 64, boxSizing: "border-box", padding: dense ? "12px 0" : "14px 0", backgroundColor: N.n2, borderRadius: R.md, border: `2px dashed ${T.bdark}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: dense ? 5 : 6, cursor: "pointer" }}>
                <Icon aria-hidden="true" style={{ width: dense ? 18 : 20, height: dense ? 18 : 20, color: T.second }} />
                <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.apoio }}>{text}</span>
              </div>
            </ObjectUploader>
          </div>
        ))}
      </div>

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 72 : 84}px, 1fr))`, gap: 8, marginTop: dense ? 10 : 12 }}>
          {photos.map(url => (
            <div key={url} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`, backgroundColor: N.n2 }}>
              <img loading="lazy" decoding="async" src={url} alt="Foto anexada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {/* Alvo de toque 44×44 (área invisível maior que o X visível) e
                  confirmação antes de remover — o botão de 20px colado na
                  miniatura removia a foto num toque acidental, sem volta. */}
              <button
                type="button"
                onClick={() => { void pedirRemocao(url); }}
                title="Remover foto"
                aria-label="Remover foto"
                style={{ position: "absolute", top: 0, right: 0, width: 44, height: 44, background: "transparent", border: "none", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: 4, cursor: "pointer" }}
              >
                <span style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: "rgba(28,25,23,0.75)", color: T.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X style={{ width: 11, height: 11 }} />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
