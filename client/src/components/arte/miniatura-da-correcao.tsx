import { useState } from "react";
import { FileText } from "lucide-react";
import { miniatura } from "@/lib/miniatura";
import { T, TOM } from "@/lib/theme";

/**
 * Miniatura da nova versão na Correção. Antes testava a EXTENSÃO na URL para
 * decidir entre imagem e ícone de arquivo — e o upload devolve
 * `/objects/uploads/<uuid>`, sem extensão: toda imagem subida (ou
 * reaproveitada pelo "Buscar arte já feita") aparecia como PDF. Agora tenta a
 * miniatura sempre e só cai no ícone quando o navegador não consegue pintar
 * (PDF de verdade). `key={url}` no uso zera o `falhou` a cada arquivo novo.
 */
export function MiniaturaDaCorrecao({ url }: { url: string }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: TOM.sucesso.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
      {falhou
        ? <FileText style={{ width: 15, height: 15, color: T.surface }} />
        : <img loading="lazy" decoding="async" src={miniatura(url)} alt="" onError={() => setFalhou(true)} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 8 }} />}
    </div>
  );
}
