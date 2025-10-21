# NORTE - Sistema de Gestão de Produção Gráfica

## Visão Geral

Sistema completo de gestão de produção gráfica desenvolvido para **NORTE Marketing Esportivo** para substituir planilhas Excel, mantendo a agilidade do processo atual mas com controle total, rastreabilidade e notificações automáticas.

O sistema gerencia o fluxo completo: **Solicitação → Arte → Gráfica → Entrega**

## Identidade Visual

**Cliente**: NORTE Marketing Esportivo  
**Logo**: Exibido no header da sidebar  
**Paleta de Cores**:
- NORTE Blue (Primária): 210 70% 25% - Azul escuro do logo
- NORTE Cyan (Accent): 188 100% 42% - Turquesa/Ciano do logo
- NORTE Magenta: 330 65% 50% - Rosa/Magenta do degradê
- NORTE Purple: 280 55% 45% - Roxo/Violeta do degradê

**Tema**: Light mode profissional com fundo branco limpo, bordas sutis e gradientes de marca no header.

## Arquitetura

### Stack Tecnológica
- **Frontend**: React + TypeScript + Tailwind CSS + Shadcn UI
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon)
- **Real-time**: WebSockets para notificações e atualizações
- **Validação**: Zod schemas
- **ORM**: Drizzle ORM

### Estrutura de Pastas
```
client/
  src/
    components/       # Componentes reutilizáveis
      ui/            # Componentes Shadcn
      app-sidebar.tsx
      notification-bell.tsx
      status-badge.tsx
    pages/           # Páginas da aplicação
      painel-geral.tsx    # Dashboard com status geral
      eventos.tsx         # Lista de eventos
      event-detail.tsx    # Detalhes e itens de um evento
      arte.tsx           # Módulo de aprovação
      grafica.tsx        # Módulo de produção
      modelos.tsx        # Templates reutilizáveis
      calendario.tsx     # Calendário de eventos
server/
  routes.ts          # API endpoints
  storage.ts         # Interface de dados
  db.ts             # Conexão PostgreSQL
shared/
  schema.ts         # Schemas Drizzle e tipos TypeScript
```

## Módulos Principais

### 1. Painel Geral (Dashboard)
- **Rota**: `/`
- **Funcionalidade**: Visualização em tempo real de todos os itens de todos os eventos
- **Features**:
  - Cards de estatísticas (Total, Solicitados, Liberados, Em Produção, Finalizados)
  - Tabela completa com filtros por status e busca
  - Cores de status para identificação visual rápida
  - Atualização em tempo real via WebSocket

### 2. Eventos
- **Rota**: `/eventos`
- **Funcionalidade**: Gerenciamento de eventos
- **Features**:
  - Listagem de eventos em cards visuais
  - Criação de novos eventos (nome, data início, data saída caminhão)
  - Status visual por cores:
    - 🟩 Verde = Finalizado
    - 🟨 Amarelo = Criado
    - 🟥 Vermelho = Urgente (<48h)
  - Detalhamento de eventos com lista de itens

### 3. Itens (Event Detail)
- **Rota**: `/eventos/:id`
- **Funcionalidade**: Gerenciamento de itens gráficos por evento
- **Features**:
  - Adição de itens com tipo, quantidade, área, visual, material, acabamento
  - Cálculo automático de m² = quantidade × área × visual
  - Observações por item
  - Não pode modificar itens, apenas adicionar (conforme especificação)

### 4. Arte
- **Rota**: `/arte`
- **Funcionalidade**: Liberação de arquivos para impressão
- **Features**:
  - Visualização de itens pendentes de aprovação
  - Detalhes completos de cada item
  - Botão de liberação que:
    - Muda status para "approved"
    - Notifica a Gráfica automaticamente
    - Torna item visível no módulo de produção
  - Histórico de itens aprovados

### 5. Gráfica
- **Rota**: `/grafica`
- **Funcionalidade**: Controle de entrega de materiais
- **Features**:
  - Visualização de itens liberados pela Arte em tabela
  - Colunas: Evento, Item, Qtd Total, Qtd Produzida, Material, Status
  - Botão "Marcar Entregue" por item
  - Modal de entrega com:
    - Quem recebeu o material (obrigatório)
    - Foto da entrega (opcional)
  - Filtros por status
  - Atualização em tempo real

### 6. Modelos
- **Rota**: `/modelos`
- **Funcionalidade**: Templates de itens reutilizáveis
- **Features**:
  - Criação de modelos padrão (ex: "2x1", "Rolo de gradil")
  - Medidas fixas ou variáveis
  - Materiais e acabamentos disponíveis
  - Reutilização em eventos futuros

### 7. Calendário
- **Rota**: `/calendario`
- **Funcionalidade**: Visualização temporal de eventos
- **Features**:
  - Grade mensal com indicadores de eventos (semana começa na segunda-feira, domingo no final)
  - Cores por status **SEPARADAS** para cada tipo de data:
    - 📅 **Início do Evento** (startDate): status baseado em quanto tempo falta para o evento começar
    - 🚚 **Saída do Caminhão** (truckDepartureDate): status baseado em quanto tempo falta para o caminhão sair
  - Cada data exibe sua própria cor: 🟢 Verde (passou/finalizado) 🔵 Azul (>48h) 🟡 Amarelo (24-48h) 🔴 Vermelho (<24h)
  - Alertas visuais para saída do caminhão com <48h
  - Legenda explicativa
  - Modal com detalhes completos ao clicar no dia
  - Cards de alerta com contagem regressiva

## Sistema de Status

### Status de Eventos
- `created` - Evento criado (🟨 Amarelo)
- `completed` - Evento finalizado (🟩 Verde)
- `urgent` - Menos de 48h para saída do caminhão (🟥 Vermelho)

### Status de Itens
- `requested` - Item solicitado, aguardando aprovação (🟨 Amarelo)
- `approved` - Liberado pela Arte (🔵 Azul)
- `inProduction` - Em produção na Gráfica (🟧 Laranja)
- `produced` - Produzido (🟩 Verde)
- `delivered` - Entregue (🟩 Verde)

## Modelo de Dados

### Events
```typescript
{
  id: varchar (UUID)
  name: text
  startDate: timestamp
  truckDepartureDate: timestamp
  status: text (created/completed/urgent)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### Items
```typescript
{
  id: varchar (UUID)
  eventId: varchar (FK)
  type: text
  quantity: integer
  area: decimal
  visual: decimal
  material: text
  finish: text
  measurement: text
  calculatedM2: decimal
  status: text
  observations: text
  quantityProduced: integer (nullable)
  receivedBy: text (nullable)
  deliveryPhotoUrl: text (nullable)
  deliveredAt: timestamp (nullable)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### StandardItems
```typescript
{
  id: varchar (UUID)
  name: text
  type: text
  area: decimal (nullable)
  visual: decimal (nullable)
  materials: text[] (array)
  finishes: text[] (array)
  hasVariableMeasurement: boolean
  createdAt: timestamp
}
```

### Notifications
```typescript
{
  id: varchar (UUID)
  type: text
  message: text
  eventId: varchar (FK, nullable)
  itemId: varchar (FK, nullable)
  isRead: boolean
  createdAt: timestamp
}
```

### ProductionUpdates
```typescript
{
  id: varchar (UUID)
  itemId: varchar (FK)
  deliveredBy: text
  photoUrl: text
  quantityProduced: integer
  createdAt: timestamp
}
```

## API Endpoints

### Events
- `GET /api/events` - Lista todos os eventos
- `GET /api/events/:id` - Detalhes de um evento
- `POST /api/events` - Cria novo evento
- `PATCH /api/events/:id` - Atualiza evento

### Items
- `GET /api/items` - Lista todos os itens
- `GET /api/items/:eventId` - Itens de um evento específico
- `GET /api/items/pending` - Itens pendentes de aprovação (Arte)
- `GET /api/items/approved` - Itens aprovados (Gráfica)
- `POST /api/items` - Cria novo item
- `POST /api/items/bulk` - Cria múltiplos itens (entrada rápida)
- `PATCH /api/items/:id/approve` - Aprova item (Arte)
- `PATCH /api/items/:id/deliver` - Marca item como entregue (Gráfica)
- `POST /api/items/:id/production` - Atualiza produção (Gráfica)

### Standard Items
- `GET /api/standard-items` - Lista modelos
- `POST /api/standard-items` - Cria modelo

### Notifications
- `GET /api/notifications` - Lista notificações
- `PATCH /api/notifications/:id/read` - Marca como lida

## Sistema de Notificações

As notificações são criadas automaticamente em:
1. Criação de evento → Notifica Arte e Gráfica
2. Adição de novos itens → Notifica Arte e Gráfica
3. Liberação de arte → Notifica Gráfica
4. Alertas de prazo (48h, 24h, 12h antes da saída)

## Sistema de Cores (Design Guidelines)

### Cores da Marca NORTE
- **NORTE Blue** (210 70% 25%): Cor primária - botões principais, elementos importantes
- **NORTE Cyan** (188 100% 42%): Accent - ações secundárias, links
- **NORTE Magenta** (330 65% 50%): Destaques especiais (decorativo)
- **NORTE Purple** (280 55% 45%): Accent alternativo (decorativo)

### Status Colors (Sistema de Workflow)
- **Verde** (142 76% 36%): Finalizado, Produzido, Entregue
- **Amarelo** (45 93% 47%): Criado, Solicitado, Aguardando
- **Vermelho** (0 84% 60%): Urgente, Atraso
- **Azul** (217 91% 60%): Liberado, Em Processo
- **Laranja** (25 95% 53%): Em Produção

### Light Mode (Padrão)
O sistema usa tema light profissional:
- Background: 0 0% 100% (branco puro)
- Cards: 0 0% 100% (branco)
- Border: 220 13% 91% (cinza suave)
- Text Primary: 220 15% 15% (cinza escuro)

## Funcionalidades Futuras (Fase 2)

1. **Sistema de perfis de acesso**:
   - Admin: acesso total
   - Solicitação: cria eventos e itens
   - Arte: libera arquivos
   - Gráfica: atualiza produção

2. **Modelos de eventos**: Criar evento baseado em evento anterior

3. **Histórico de alterações**: Rastreamento completo de quem alterou o quê

4. **Confirmação manual de alterações**: Notificações com aprovação antes de modificar

5. **Relatórios e exportação**: Dados por período, evento ou status

## Configuração e Execução

### Desenvolvimento
```bash
npm run dev
```

### Database
```bash
npm run db:push  # Sincroniza schema com banco
```

### Build
```bash
npm run build
```

## Princípios de Design

1. **Simplicidade**: Interface intuitiva como planilha
2. **Agilidade**: Entrada e atualização rápida de dados
3. **Controle Visual**: Status imediatamente identificável por cores
4. **Notificações Inteligentes**: Alertas apenas quando necessário
5. **Tempo Real**: Atualizações instantâneas via WebSocket

## Melhorias Implementadas

- ✅ Cálculo automático de m²
- ✅ Badges de status com ícones e cores
- ✅ Filtros e busca inteligente
- ✅ Cards de estatísticas em tempo real
- ✅ Calendário visual com alertas
- ✅ Responsividade completa (mobile, tablet, desktop)
- ✅ Sistema de notificações com contador
- ✅ Tabelas com zebra striping e hover states
- ✅ Modais bem formatados para formulários
- ✅ Design system consistente
- ✅ Entrada rápida de itens (bulk entry) como modo padrão
- ✅ Gráfica simplificada focada em entrega com campos específicos

## Observações Técnicas

- Usa React Query para cache e sincronização de dados
- Validação com Zod em frontend e backend
- TypeScript strict mode para type safety
- Shadcn UI para componentes consistentes
- Tailwind CSS para estilização responsiva
- WebSocket path customizado (`/ws`) para evitar conflito com Vite HMR

### Timezone e Horários (Brasília - UTC-3)
- **Banco de Dados**: PostgreSQL armazena timestamps em UTC
- **Entrada de dados**: Input `datetime-local` captura hora local do navegador (Brasília)
- **Conversão automática**: JavaScript converte automaticamente entre UTC (banco) e timezone local (navegador)
- **Cálculo de prazos**: Sempre usa `new Date()` que considera o timezone local do navegador
- **Sistema de alertas**: 
  - Verde: Evento finalizado ou já passou
  - Azul: Mais de 48h até saída do caminhão
  - Amarelo: Entre 24h e 48h até saída
  - Vermelho: Menos de 24h - CRÍTICO!
