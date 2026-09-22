// VER COMO: enquanto o admin navega como outro perfil, o que ele faz entra na
// trilha com o nome dele E o perfil emprestado — "Ana (como Gráfica)" — para
// ninguém confundir a ação com a de alguém daquele perfil.
const ROTULO: Record<string, string> = {
  solicitacao: "Solicitação",
  arte: "Arte",
  grafica: "Gráfica",
  atendimento: "Atendimento",
  admin: "Admin",
};

export function nomeParaATrilha(
  nome: string,
  sessao: { papelReal?: string; userRole?: string; userKit?: boolean } | undefined,
): string {
  if (!sessao?.papelReal || !sessao.userRole) return nome;
  const perfil = ROTULO[sessao.userRole] ?? sessao.userRole;
  return `${nome} (como ${perfil}${sessao.userKit ? " · Kit" : ""})`;
}
