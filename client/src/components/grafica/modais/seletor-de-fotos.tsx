// Seletor de fotos (câmera + galeria) com miniaturas e remoção — o MESMO na
// conferência individual e na conferência em lote.
import { useEffect, useState } from "react";
import { Camera, Check, ImagePlus, Trash2, X } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { useIsMobile } from "@/hooks/use-mobile";
import { FS, FW, N, R, T, TOM } from "@/lib/theme";
import { miniatura } from "@/lib/miniatura";
import { VisorDeFotos } from "./visor-de-fotos";

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
  // Tocar na miniatura abre a foto grande (30/10): é onde se vê se ficou boa.
  const [vendo, setVendo] = useState<number | null>(null);
  useEffect(() => { onEnviandoMudou?.(emAndamento); }, [emAndamento]); // eslint-disable-line react-hooks/exhaustive-deps
  // Saiu da tela no meio do envio: não deixa o "Enviando foto…" preso.
  useEffect(() => () => onEnviandoMudou?.(0), []); // eslint-disable-line react-hooks/exhaustive-deps
  const buttons = [
    // Depois da primeira, o botão diz que dá para tirar MAIS (dono, 30/10: "mais fotos").
    { capture: true, Icon: Camera, text: dense ? "Câmera" : photos.length > 0 ? "Tirar outra" : "Tirar Foto" },
    { capture: false, Icon: ImagePlus, text: dense ? "Galeria" : photos.length > 0 ? "Anexar mais" : "Anexar Fotos" },
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
      <VisorDeFotos fotos={photos} indice={vendo} aoMudar={setVendo} aoRemover={onRemove} />
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
          <div key={capture ? "camera" : "galeria"} style={{ flex: 1 }}>
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
              onEnviandoMudou={(b) => { const k = capture ? "camera" : "galeria"; setEnviando(prev => (prev[k] === b ? prev : { ...prev, [k]: b })); }}
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
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 84 : 96}px, 1fr))`, gap: 8, marginTop: dense ? 10 : 12 }}>
          {photos.map((url, i) => (
            <div key={url} style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}`, backgroundColor: N.n2 }}>
              <button type="button" onClick={() => setVendo(i)} aria-label={`Ver a foto ${i + 1} em tamanho grande`} data-testid={`foto-anexada-${i}`} style={{ display: "block", width: "100%", aspectRatio: "1", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
                <img loading="lazy" decoding="async" src={miniatura(url) ?? url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
              {/* Faixa própria de 44px e confirmação antes de remover: sobre a
                  miniatura, o alvo cobria o meio da foto e quem tocava para
                  ampliar caía em Remover. */}
              <button
                type="button"
                onClick={() => { void pedirRemocao(url); }}
                title="Remover foto"
                aria-label="Remover foto"
                style={{ width: "100%", height: 44, padding: 0, border: "none", borderTop: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.second, fontSize: FS.meta, fontWeight: FW.medio, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}
              >
                <X aria-hidden="true" style={{ width: 12, height: 12 }} /> Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
