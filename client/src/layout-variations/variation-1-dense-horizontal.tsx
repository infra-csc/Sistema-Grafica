import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function DenseHorizontalLayout() {
  // Mock data
  const statusData = [
    { label: 'Solicitado', value: 12, color: 'bg-blue-500' },
    { label: 'Ag. Vinc.', value: 8, color: 'bg-yellow-500' },
    { label: 'Ag. Envio', value: 5, color: 'bg-orange-500' },
    { label: 'Ag. Aprov.', value: 15, color: 'bg-rose-500' },
    { label: 'Ag. Final.', value: 3, color: 'bg-cyan-500' },
    { label: 'Pronto', value: 7, color: 'bg-purple-500' },
    { label: 'Liberado', value: 22, color: 'bg-green-500' },
    { label: 'Produção', value: 18, color: 'bg-indigo-500' },
  ];

  const chartData = [
    { status: 'Solicitado', count: 12 },
    { status: 'Aguardando', count: 31 },
    { status: 'Produção', count: 40 },
    { status: 'Entregue', count: 22 },
  ];

  return (
    <div className="h-screen bg-background flex flex-col p-4 gap-3 overflow-hidden">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Painel de Status Geral</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada em tempo real</p>
      </div>

      {/* Status Horizontal Scroll */}
      <div className="flex overflow-x-auto gap-2 pb-2 flex-shrink-0">
        {statusData.map((status, i) => (
          <div key={i} className="flex-shrink-0">
            <Card className="w-28 cursor-pointer hover-elevate">
              <CardContent className="p-2">
                <div className={`${status.color} h-1 rounded mb-1`}></div>
                <div className="text-xs font-medium text-center truncate">{status.label}</div>
                <div className="text-lg font-bold text-center">{status.value}</div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Two Column Layout - Chart & Filters */}
      <div className="flex gap-3 flex-1 overflow-hidden">
        {/* Left: Chart */}
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição</CardTitle>
          </CardHeader>
          <CardContent className="h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Right: Compact Filters & Items */}
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          {/* Filters - Compact */}
          <Card className="flex-shrink-0">
            <CardContent className="p-2">
              <div className="grid grid-cols-3 gap-2">
                <input type="text" placeholder="Buscar..." className="border rounded px-2 py-1 text-xs" />
                <select className="border rounded px-2 py-1 text-xs">
                  <option>Todos eventos</option>
                </select>
                <select className="border rounded px-2 py-1 text-xs">
                  <option>Todos status</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Compact Items List */}
          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Itens</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-2">
              <div className="space-y-1">
                {[1, 2, 3, 4, 5, 6, 7].map(i => (
                  <div key={i} className="flex items-center justify-between text-xs bg-muted p-1.5 rounded hover-elevate cursor-pointer">
                    <span className="font-mono">#{String(i).padStart(4, '0')}</span>
                    <span>Banner 2m</span>
                    <Badge variant="secondary" className="text-xs h-5">Produção</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
