import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Grid, List } from 'lucide-react';

export default function CardExplorerLayout() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const statusMetrics = [
    { label: 'Pendentes', value: 28, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Em Produção', value: 45, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Entregues', value: 67, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  const items = [
    { id: '#0001', name: 'Banner 3m x 2m', event: 'Copa América', status: 'production', priority: 'high' },
    { id: '#0002', name: 'Logo Estampado', event: 'Copa América', status: 'review', priority: 'medium' },
    { id: '#0003', name: 'Painel de Vidro', event: 'Panamericano', status: 'pending', priority: 'medium' },
    { id: '#0004', name: 'Adesivo Vinílico', event: 'Copa América', status: 'production', priority: 'low' },
    { id: '#0005', name: 'Outdoor 5m x 8m', event: 'Torneio', status: 'pending', priority: 'high' },
    { id: '#0006', name: 'Faixa de Público', event: 'Panamericano', status: 'production', priority: 'medium' },
  ];

  const statusColor = {
    pending: 'bg-yellow-100 text-yellow-800',
    review: 'bg-blue-100 text-blue-800',
    production: 'bg-purple-100 text-purple-800',
    done: 'bg-green-100 text-green-800',
  };

  return (
    <div className="h-screen bg-background flex flex-col p-4 gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0">
        <h1 className="text-2xl font-bold">Explorador de Produção</h1>
        <p className="text-sm text-muted-foreground">Navegue por itens em tempo real</p>
      </div>

      {/* Quick Stats - Horizontal */}
      <div className="grid grid-cols-3 gap-3 flex-shrink-0">
        {statusMetrics.map((metric, i) => (
          <Card key={i} className={metric.bg}>
            <CardContent className="p-4">
              <div className={`text-2xl font-bold ${metric.color}`}>{metric.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{metric.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="text"
          placeholder="Buscar itens..."
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <select className="border rounded px-3 py-2 text-sm">
          <option>Todos eventos</option>
        </select>
        <select className="border rounded px-3 py-2 text-sm">
          <option>Todos status</option>
        </select>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded ${viewMode === 'grid' ? 'bg-primary text-white' : 'border'}`}
          >
            <Grid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded ${viewMode === 'list' ? 'bg-primary text-white' : 'border'}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Items View */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto h-full">
            {items.map((item, i) => (
              <Card key={i} className="hover-elevate cursor-pointer transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <span className="font-mono text-sm font-bold text-primary">{item.id}</span>
                    <Badge
                      className={`text-xs h-5 ${statusColor[item.status as keyof typeof statusColor]}`}
                      variant="secondary"
                    >
                      {item.status === 'pending' && 'Pendente'}
                      {item.status === 'review' && 'Revisão'}
                      {item.status === 'production' && 'Produção'}
                      {item.status === 'done' && 'Entregue'}
                    </Badge>
                  </div>
                  
                  <div className="mb-2">
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{item.event}</div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-3 border-t">
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      item.priority === 'high' ? 'bg-red-100 text-red-800' :
                      item.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {item.priority === 'high' && 'Urgente'}
                      {item.priority === 'medium' && 'Normal'}
                      {item.priority === 'low' && 'Baixa'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto h-full">
            {items.map((item, i) => (
              <Card key={i} className="hover-elevate cursor-pointer">
                <CardContent className="p-3">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm font-bold text-primary w-16">{item.id}</span>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.event}</div>
                    </div>
                    <Badge
                      className={`text-xs h-5 ${statusColor[item.status as keyof typeof statusColor]}`}
                      variant="secondary"
                    >
                      {item.status === 'pending' && 'Pendente'}
                      {item.status === 'review' && 'Revisão'}
                      {item.status === 'production' && 'Produção'}
                      {item.status === 'done' && 'Entregue'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
