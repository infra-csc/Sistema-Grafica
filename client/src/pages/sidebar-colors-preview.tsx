import { LayoutDashboard, Home, Factory, Layers, Calendar, Activity, BarChart3, Link2, CheckCircle, UserCheck, ClipboardCheck } from "lucide-react";

const menuItems = [
  { title: "Painel Geral", icon: LayoutDashboard },
  { title: "Eventos", icon: Home },
  { title: "Vincular Patrocinadores", icon: Link2 },
  { title: "Arte", icon: CheckCircle },
  { title: "Atendimento", icon: UserCheck },
  { title: "Solicitação", icon: ClipboardCheck },
  { title: "Gráfica", icon: Factory },
  { title: "Modelos", icon: Layers },
  { title: "Calendário", icon: Calendar },
  { title: "Histórico", icon: Activity },
  { title: "Análises", icon: BarChart3 },
];

const colorSchemes = [
  {
    name: "Criativa + Profissional",
    primary: "#1a3a52",
    secondary: "#e63c7a",
    accent: "#ff7a3d",
    background: "#f3f4f6",
    text: "#1a1916",
    textSecondary: "#6b6760",
  },
  {
    name: "Warm",
    primary: "#3d2817",
    secondary: "#ff6b4a",
    accent: "#d4af37",
    background: "#f5f3f0",
    text: "#1a1916",
    textSecondary: "#6b6760",
  },
  {
    name: "Minimalista Moderna",
    primary: "#2d2d2d",
    secondary: "#06b6d4",
    accent: "#84cc16",
    background: "#f1f5f9",
    text: "#1a1916",
    textSecondary: "#6b6760",
  },
  {
    name: "Design Studio",
    primary: "#312e81",
    secondary: "#b8860b",
    accent: "#a78bfa",
    background: "#f5f3f0",
    text: "#1a1916",
    textSecondary: "#6b6760",
  },
];

function SidebarPreview({ scheme }: { scheme: (typeof colorSchemes)[0] }) {
  return (
    <div className="w-64 flex flex-col h-full" style={{ backgroundColor: scheme.background }}>
      {/* Header */}
      <div
        className="h-16 flex items-center px-4 border-b gap-3"
        style={{
          borderColor: scheme.primary + "20",
          backgroundColor: scheme.primary + "08",
        }}
      >
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ background: `linear-gradient(135deg, ${scheme.primary}, ${scheme.secondary})` }}
        >
          N
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold leading-tight" style={{ color: scheme.primary }}>
            Sistema Gráfica
          </h1>
          <p className="text-xs" style={{ color: scheme.textSecondary }}>
            NORTE
          </p>
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto py-4">
        {menuItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = idx === 0;
          return (
            <div
              key={item.title}
              className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all rounded-md mx-2"
              style={{
                backgroundColor: isActive ? scheme.primary + "15" : "transparent",
                color: isActive ? scheme.primary : scheme.textSecondary,
              }}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium truncate">{item.title}</span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="border-t p-4 text-xs flex items-center gap-2"
        style={{
          borderColor: scheme.primary + "20",
          color: scheme.textSecondary,
        }}
      >
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
          style={{ backgroundColor: scheme.secondary }}
        >
          A
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate" style={{ color: scheme.text }}>
            Admin
          </p>
          <p className="truncate">Administrador</p>
        </div>
      </div>
    </div>
  );
}

export default function SidebarColorsPreview() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Variações de Cores - Sidebar</h1>
          <p className="text-gray-600">Escolha a paleta que melhor combina com o visual da NORTE</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {colorSchemes.map((scheme) => (
            <div key={scheme.name} className="flex flex-col gap-4">
              <div
                className="rounded-lg overflow-hidden shadow-lg border border-gray-200"
                style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
              >
                <SidebarPreview scheme={scheme} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">{scheme.name}</h3>
                <div className="flex gap-2 flex-wrap">
                  <div
                    className="w-8 h-8 rounded border border-gray-300"
                    style={{ backgroundColor: scheme.primary }}
                    title="Primária"
                  ></div>
                  <div
                    className="w-8 h-8 rounded border border-gray-300"
                    style={{ backgroundColor: scheme.secondary }}
                    title="Secundária"
                  ></div>
                  <div
                    className="w-8 h-8 rounded border border-gray-300"
                    style={{ backgroundColor: scheme.accent }}
                    title="Acentos"
                  ></div>
                </div>
                <p className="text-xs text-gray-600 mt-2 space-y-1">
                  <div>Primária: {scheme.primary}</div>
                  <div>Secundária: {scheme.secondary}</div>
                  <div>Acentos: {scheme.accent}</div>
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 p-8 bg-blue-50 rounded-lg border border-blue-200">
          <h2 className="text-xl font-bold text-blue-900 mb-2">Qual paleta você prefere?</h2>
          <p className="text-blue-800">
            Após escolher, posso atualizar todo o dashboard com a paleta selecionada, alterando:
          </p>
          <ul className="text-blue-800 ml-4 mt-2 space-y-1">
            <li>• Cards de status com cores mais vibrantes</li>
            <li>• Sidebar com gradientes e acentos</li>
            <li>• Tabelas com badges coloridas</li>
            <li>• Botões e elementos interativos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
