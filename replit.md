# NORTE - Sistema de Gestão de Produção Gráfica

## Overview
NORTE is a comprehensive graphic production management system designed for NORTE Marketing Esportivo. Its primary purpose is to replace Excel-based workflows, significantly enhancing agility, control, and traceability across the entire production lifecycle: Request → Art → Printing → Delivery. The system aims to streamline operations, provide real-time oversight, and ensure timely communication and automatic notifications at every stage. Key ambitions include improving operational efficiency, ensuring timely project completion, and providing a robust, scalable platform for managing graphic production.

## Recent Changes (November 18, 2025)
- **Complete Workflow Status Restructure**: Implemented comprehensive status system with distinct colors for each workflow stage to eliminate confusion:
  1. **Solicitado** (requested): Yellow - Item criado
  2. **Aguardando Vinculação** (awaiting_linking): Orange - Precisa vincular patrocinadores
  3. **Aguardando Envio** (awaiting_submission): Blue - Vinculação feita, Arte precisa enviar aprovação
  4. **Aguardando Aprovação** (awaiting_approval): Rose/Pink - Arte enviou, aguardando patrocinador aprovar
  5. **Aguardando Finalização** (awaiting_finalization): Purple - Patrocinador aprovou, Arte precisa finalizar
  6. **Aguardando Revisão Final** (awaiting_final_review): Violet - Arte finalizou, Solicitação revisa
  7. **Pronto p/ Produção** (ready_for_production): Cyan - Aprovado para produção
  8. **Liberado** (approved): Green - Liberado pela Arte
  9. **Em Produção** (inProduction): Production color - Em processo de produção
  10. **Produzido** (produced): Fuchsia/Magenta - Item produzido
  11. **Entregue** (delivered): Emerald - Item entregue
- **Backward Compatibility**: Status antigos (awaiting_sponsor_approval, sponsor_approved, awaiting_creator_review) mantidos para compatibilidade com dados existentes.
- **Painel Geral Complete Redesign**: Redesigned the General Panel with professional layout and improved UX:
  - **12 Dashboard Cards**: Colorful, clickable status cards at the top (1 Total + 11 status types) with visual ring highlighting when selected for filtering
  - **Event Grouping**: Items are grouped by event using unique eventId keys (prevents collisions from duplicate event names), displaying event name with item count badges
  - **Dialog-based Item Details**: Items open in modal dialogs instead of inline expansion for better visualization and focus
  - **Integrated Details**: Each modal shows complete item information including specifications, production data, observations, audit log timeline, and comments section
  - **Smart Filtering**: Search by event/type/ID, event dropdown filter, and click-to-filter status cards
  - **Type Safety**: Proper TypeScript typing for grouped items with eventId-based unique keys
  - **Responsive Item Layout**: Fully optimized for mobile-to-desktop with progressive disclosure:
    - **Mobile (< 768px)**: Display ID, Type (truncated 150px), Quantity, m², Status (short labels like "Ag. Vinculação"), flex-wrap to 2 lines if needed
    - **Tablet (≥ 768px)**: + File dimensions, Type expands, Status full labels ("Aguardando Vinculação")
    - **Desktop (≥ 1024px)**: + Description, all info visible in single row
    - **StatusBadge Responsive**: Short labels on mobile (40-50% space savings), full labels on tablet+
    - **Layout Strategy**: flex-wrap with flex-shrink-0 on critical fields (ID, Qty, m²), Type uses max-w-[150px] md:max-w-none md:flex-1 for responsive expansion
    - **No Horizontal Overflow**: Validated at 320px width with proper wrapping and truncation
- **Display ID Migration**: Successfully migrated 57 items from legacy "ITEM-XXXX" format to new "#XXXX" format via SQL update. Display IDs properly displayed across all views with monospace font and primary color styling.
- **Status Badge Bug Fix**: Corrected issue where items with `skip_approval=true` in database were incorrectly showing as "Pronto" (pending) in Vincular Patrocinadores page.
- **Painel Geral Data Loading**: Fixed query key from `/api/items/global` to `/api/items` to properly load all items with event data.

## User Preferences
I prefer concise and clear explanations. I want iterative development with frequent, small updates rather than large, infrequent ones. Always ask for confirmation before making significant changes to the codebase or architectural decisions. Do not make changes to the `shared/schema.ts` file without explicit instruction.

## System Architecture

### UI/UX Decisions
The system features a professional light mode theme with a clean white background, subtle borders, and brand gradients in the header. The UI prioritizes simplicity, agility, visual control through color-coded statuses, and intelligent notifications. Key visual elements include a client logo in the sidebar, a defined brand color palette (NORTE Blue, Cyan, Magenta, Purple), and status colors (Green, Yellow, Red, Blue, Orange). The dashboard includes real-time statistics, a filterable table, visual graphs, urgent alerts, and expanded statistics. A calendar provides a monthly grid with status-based coloring and alerts, and a history section offers a vertical timeline of activities. Navigation uses modern segmented controls with distinct color themes for different workflow stages.

### Technical Implementations
- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI.
- **Backend**: Express.js, TypeScript.
- **Database**: PostgreSQL (Neon).
- **Real-time Communication**: WebSockets for notifications and live updates.
- **Data Validation**: Zod schemas.
- **ORM**: Drizzle ORM.
- **State Management/Data Fetching**: React Query.
- **Timezone Handling**: UTC timestamps in DB, JavaScript handles conversions to browser's local timezone (Brasília - UTC-3).
- **Date Handling**: `startDate` (date only), `truckDepartureDate` (datetime-local).

### Feature Specifications
- **Modules**: General Panel (Dashboard), Events, Items (Event Detail), Art Approval, Printing Control, Templates, Calendar, History, Sponsors, Vincular Patrocinadores (Arte-only).
- **Display ID System**: Sequential item identification system using simple format #0001 to #9999, automatically generated via PostgreSQL sequence with lazy initialization. Visible in all item tables and detail views across the application (Painel Geral, Arte, Gráfica, Solicitação, Atendimento, Vincular Patrocinadores, and Timeline modal). Provides clear, human-readable tracking throughout the production workflow.
- **Notifications**: Automated for event creation, item additions, art approval, and deadline alerts (48h, 24h, 12h before truck departure) targeted to specific user roles.
- **Item Statuses**: `requested`, `awaiting_sponsor_approval`, `sponsor_approved`, `awaiting_creator_review`, `ready_for_production`, `approved`, `inProduction`, `produced`, `delivered`.
- **Event Statuses**: `created`, `completed`, `urgent`.
- **User Authentication & Access Control**: Full login/logout, Bcryptjs for passwords, mandatory first-time password change, user management (Admin), 5 user profiles (Admin, Solicitation, Art, Graphics, Atendimento) with route protection and `hasPermission()` checks.
- **Multi-Stage Approval Workflow**: Events can have multiple sponsors; items support many-to-many sponsor linking (done by Arte profile); sponsor approval required before creator review; Arte uploads approval thumbs and final files; creator reviews and releases to production. Draft review system allows bulk submission of new items to Arte.
- **Sponsor Linking Workflow**: Solicitação creates items (status: requested) WITHOUT sponsor assignment → Arte links sponsors via dedicated page `/vincular-patrocinadores` → Solicitação sends items to Arte (status change) → Normal approval workflow continues.
- **Sponsor Management**: Full CRUD for sponsors (admin-only); events support multi-sponsor selection; items support many-to-many sponsor selection (via Arte profile only). Client management has been removed in favor of direct sponsor linking.
- **Vincular Patrocinadores Page**: Dedicated page accessible only to Arte and Admin profiles where Arte team links sponsors to items before they enter production workflow. Items remain visible and editable on this page through multiple workflow stages (requested → awaiting_sponsor_approval → sponsor_approved → awaiting_creator_review) until either: (1) approved by creator (moves to ready_for_production), or (2) event start date passes. This allows continuous editing of sponsor assignments throughout the approval process. Features bulk selection for applying sponsors to multiple items simultaneously.
- **Audit Logs**: Automatic logging of significant actions (event/item creation, approval, delivery) including user, timestamp, action, entity type/ID, and details, viewable in History and Event Details.
- **Admin Edit/Delete**: Functionality for Admin users to edit and delete events and items with corresponding audit logs and confirmation dialogs.
- **Event Priority System**: Events can have priorities (Low, Medium, High, Urgent), displayed visually with badges and influencing calendar coloring.
- **Automatic Event Status**: Events are marked "completed" when all items are delivered; status reverts if new items are added to a completed event.
- **Approval Assets**: Items track approval thumbnail URLs (for sponsor review) and final file URLs (required before production). Shared PDF upload for batch processing during the Arte approval stage.

### System Design Choices
- **Folder Structure**: Client, server, and shared directories.
- **Component-Based**: Reusable UI components.
- **API Endpoints**: RESTful API.
- **Scalability**: Robust backend and database.
- **Responsiveness**: Full responsiveness for all devices.

## External Dependencies
- **Database**: PostgreSQL (Neon).
- **Frontend Libraries**: React, Tailwind CSS, Shadcn UI, Recharts, date-fns.
- **Backend Framework**: Express.js.
- **Data ORM**: Drizzle ORM.
- **Validation Library**: Zod.
- **Real-time Communication**: WebSockets.
- **Authentication**: Bcryptjs.