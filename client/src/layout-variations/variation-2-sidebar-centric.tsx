import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronDown } from 'lucide-react';

export default function SidebarCentricLayout() {
  const [filterOpen, setFilterOpen] = useState(false);

  const statusData = [
    { label: 'Solicitado', value: 12, color: 'bg-blue-500', trend: 'up' },
    { label: 'Ag. Vinculação', value: 8, color: 'bg-yellow-500', trend: 'down' },
    { label: 'Ag. Envio', value: 5, color: 'bg-orange-500', trend: 'stable' },
    { label: 'Ag. Aprovação', value: 15, color: 'bg-rose-500', trend: 'up' },
    { label: 'Ag. Finalização', value: 3, color: 'bg-cyan-500', trend: 'stable' },
    { label: 'Pronto', value: 7, color: 'bg-purple-500', trend: 'down' },
    { label: 'Liberado', value: 22, color: 'bg-green-500', trend: 'up' },
  ];

  const trendData = [
    { time: 'Seg', pending: 45, active: 38, done: 22 },
    { time: 'Ter', pending: 42, active: 40, done: 25 },
    { time: 'Qua', pending: 40, active: 42, done: 28 },
    { time: 'Qui', pending: 38, active: 45, done: 32 },
    { time: 'Sex', pending: 35, active: 48, done: 35 },
  ];

  return (
    <div className="h-screen bg-background flex gap-0 overflow-hidden">
      {/* Left Sidebar - Status Stack */}
      <div className="w-64 border-r flex flex-col overflow-hidden">
        <div className="p-4 border-b flex-shrink-0">
          <h2 className="text-sm font-bold">Status Atual</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-1 p-2">
            {statusData.map((status, i) => (
              <div key={i} className="p-2 rounded hover-elevate cursor-pointer group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{status.label}</span>
                  <Badge className="h-5 text-xs">{status.value}</Badge>
                </div>
                <div className={`h-1 ${status.color} rounded w-full opacity-60`}></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b p-4 flex-shrink-0">
          <h1 className="text-2xl font-bold">Painel de Status Geral</h1>
          <p className="text-xs text-muted-foreground mt-1">Monitore a produção em tempo real</p>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Floating Filter Bar */}
          <div className="p-3 border-b bg-card/50 flex-shrink-0">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center gap-2 text-sm font-medium mb-2"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
              Filtros Avançados
            </button>
            
            {filterOpen && (
              <div className="grid grid-cols-4 gap-2">
                <input type="text" placeholder="Buscar..." className="border rounded px-2 py-1.5 text-xs" />
                <select className="border rounded px-2 py-1.5 text-xs">
                  <option>Todos eventos</option>
                </select>
                <select className="border rounded px-2 py-1.5 text-xs">
                  <option>Todos tipos</option>
                </select>
                <select className="border rounded px-2 py-1.5 text-xs">
                  <option>Todos status</option>
                </select>
              </div>
            )}
          </div>

          {/* Content Grid */}
          <div className="flex-1 overflow-hidden flex flex-col gap-3 p-3">
            {/* Trend Chart */}
            <Card className="h-40 flex-shrink-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tendência de Produção</CardTitle>
              </CardHeader>
              <CardContent className="h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="pending" stroke="#f59e0b" strokeWidth={2} />
                    <Line type="monotone" dataKey="active" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="done" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Events List */}
            <Card className="flex-1 overflow-hidden flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Eventos em Produção</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-2">
                <div className="space-y-2">
                  {[
                    { name: 'Copa América 2024', items: 12, status: 'production' },
                    { name: 'Panamericano 2024', items: 8, status: 'review' },
                    { name: 'Torneio Estadual', items: 5, status: 'pending' },
                  ].map((event, i) => (
                    <Card key={i} className="hover-elevate cursor-pointer">
                      <CardContent className="p-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-medium">{event.name}</div>
                            <div className="text-xs text-muted-foreground">{event.items} itens</div>
                          </div>
                          <Badge className="text-xs">{event.items}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
