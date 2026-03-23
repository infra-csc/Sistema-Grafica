import React, { useState } from 'react';
import DenseHorizontalLayout from './variation-1-dense-horizontal';
import SidebarCentricLayout from './variation-2-sidebar-centric';
import CardExplorerLayout from './variation-3-card-explorer';

export default function LayoutVariationsPreview() {
  const [selectedVariation, setSelectedVariation] = useState<'v1' | 'v2' | 'v3'>('v1');

  const variations = {
    v1: {
      name: 'Variação 1: Dense Horizontal',
      description: 'Fluxo horizontal compacto com status em scroll, filtros minimizados e tabelas densas',
      component: DenseHorizontalLayout,
    },
    v2: {
      name: 'Variação 2: Sidebar Centric',
      description: 'Painel lateral com status stacked, filtros flutuantes e gráficos de tendência centrais',
      component: SidebarCentricLayout,
    },
    v3: {
      name: 'Variação 3: Card Explorer',
      description: 'Grid/Lista de cards exploráveis com métricas rápidas e alternância visual de visualização',
      component: CardExplorerLayout,
    },
  };

  const selectedVar = variations[selectedVariation];
  const SelectedComponent = selectedVar.component;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Selector Bar */}
      <div className="border-b p-4 bg-card">
        <h1 className="text-lg font-bold mb-3">3 Variações de Layout</h1>
        <div className="flex gap-2 flex-wrap">
          {(Object.entries(variations) as Array<[keyof typeof variations, typeof variations['v1']]>).map(([key, variation]) => (
            <button
              key={key}
              onClick={() => setSelectedVariation(key)}
              className={`px-4 py-2 rounded transition-all ${
                selectedVariation === key
                  ? 'bg-primary text-white'
                  : 'border bg-background hover-elevate'
              }`}
            >
              {variation.name.split(':')[0]}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <h2 className="font-medium">{selectedVar.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">{selectedVar.description}</p>
        </div>
      </div>

      {/* Selected Variation */}
      <div className="flex-1 overflow-hidden">
        <SelectedComponent />
      </div>
    </div>
  );
}
