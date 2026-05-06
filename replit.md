## Overview
NORTE is a graphic production management system for NORTE Marketing Esportivo. It replaces Excel-based workflows to enhance agility, control, and traceability from request to delivery. The system aims to streamline operations, provide real-time oversight, ensure timely project completion, and offer a scalable platform for managing graphic production.

## User Preferences
I prefer concise and clear explanations. I want iterative development with frequent, small updates rather than large, infrequent ones. Always ask for confirmation before making significant changes to the codebase or architectural decisions. Do not make changes to the `shared/schema.ts` file without explicit instruction.

## System Architecture

### UI/UX Decisions
The system features a professional light mode theme with a clean white background, subtle borders, and brand gradients. UI prioritizes simplicity, agility, visual control through color-coded statuses, and intelligent notifications. Key visual elements include a client logo, a defined brand color palette (NORTE Blue, Cyan, Magenta, Purple), and status colors (Green, Yellow, Red, Blue, Orange). The dashboard includes real-time statistics, a filterable table, visual graphs, urgent alerts, and expanded statistics. A calendar provides a monthly grid with status-based coloring, and a history section offers a vertical timeline of activities. Navigation uses modern segmented controls with distinct color themes for different workflow stages.

### Technical Implementations
- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI.
- **Backend**: Express.js, TypeScript.
- **Database**: PostgreSQL (Neon).
- **Real-time Communication**: WebSockets for notifications and live updates.
- **Data Validation**: Zod schemas.
- **ORM**: Drizzle ORM.
- **State Management/Data Fetching**: React Query.
- **Timezone Handling**: UTC timestamps in DB, JavaScript handles conversions to browser's local timezone.
- **Date Handling**: `startDate` (date only), `truckDepartureDate` (datetime-local).

### Feature Specifications
- **Modules**: General Panel (Dashboard), Events, Items (Event Detail), Art Approval, Printing Control, Templates, Calendar, History, Sponsors, Vincular Patrocinadores.
- **Display ID System**: Sequential item identification (#0001 to #9999), automatically generated via PostgreSQL sequence, visible across all item tables and detail views.
- **Notifications**: Automated for event creation, item additions, art approval, and deadline alerts (48h, 24h, 12h before truck departure) targeted to specific user roles.
- **Item Statuses**: Comprehensive workflow statuses including `solicitado`, `aguardando_vinculacao`, `aguardando_envio`, `aguardando_aprovacao`, `aguardando_finalizacao`, `aguardando_revisao_final`, `pronto_para_producao`, `liberado`, `em_producao`, `produzido`, `entregue`.
- **Event Statuses**: `created`, `completed`, `urgent`.
- **User Authentication & Access Control**: Login/logout, Bcryptjs for passwords, mandatory first-time password change, user management (Admin), 5 user profiles (Admin, Solicitation, Art, Graphics, Atendimento) with route protection.
- **Multi-Stage Approval Workflow**: Events can have multiple sponsors; items support many-to-many sponsor linking (by Arte profile); sponsor approval required before creator review; Arte uploads approval thumbs and final files; creator reviews and releases to production.
- **Sponsor Linking Workflow**: Solicitation creates items (status: requested) without sponsor assignment. Arte links sponsors via `/vincular-patrocinadores` page. Then items proceed through the normal approval workflow.
- **Sponsor Management**: Full CRUD for sponsors (admin-only); events support multi-sponsor selection; items support many-to-many sponsor selection (Arte profile only).
- **Vincular Patrocinadores Page**: Dedicated page for Arte and Admin profiles to link sponsors to items before production. Features simplified 4-state UI model (PENDENTE/RASCUNHO/PRONTO/ENVIADO) with single badge per item, counter chips in header showing state totals, and context-aware action buttons (Salvar for unsaved changes, Enviar for ready items). Items remain editable until approved by creator or event start date passes. Supports bulk selection and batch operations.
- **Audit Logs**: Automatic logging of significant actions (creation, approval, delivery) including user, timestamp, action, entity, and details, viewable in History and Event Details.
- **Admin Edit/Delete**: Functionality for Admin users to edit and delete events and items with audit logs and confirmation.
- **Event Priority System**: Events can have priorities (Low, Medium, High, Urgent), displayed visually and influencing calendar coloring.
- **Automatic Event Status**: Events marked "completed" when all items delivered; status reverts if new items added.
- **Approval Assets**: Items track approval thumbnail URLs (for sponsor review) and final file URLs (required before production). Shared PDF upload for batch processing.
- **Event Deadline System**: 5 configurable deadline fields on each event (days relative to startDate): deadlineListaImagens (-25d), deadlineEntregaLayouts (-20d), deadlineAprovacaoLayout (-12d), deadlineRevisaoLista (-8d), deadlineProducaoGrafica (-1d). Editable at event creation/edit via collapsible "Prazos" panel. Displayed as color-coded pills in event detail header.
- **Inventory Module (Acervo)**: Full inventory management for graphic production assets. `inventory_assets` table with displayId (#EST-XXXX or #EST-XXXX-N for auto-created), name, condition (PERFEITO/AVARIA_LEVE/SUCATA), location, franchise tags, sponsorIds (many-to-many from production), approvalThumbUrl (thumbnail of approved art), trackingStatus (NO_GALPAO/EM_USO/AGUARDANDO_TRIAGEM/DESCARTADO), autoAdded flag. `event_inventory_allocations` pivot links assets to events. When gráfica marks an item as "produced", N individual inventory records are auto-created (1 per unit) inheriting sponsorIds and approvalThumbUrl. Lifecycle cron (every minute): truckDepartureDate → EM_USO; startDate+24h → AGUARDANDO_TRIAGEM (with WS notification). Pages: `/estoque` (dense CRUD table with status badges, sponsor chips, approval thumb popover, filter by status/condition/origin) and `/triagem-retorno` (triage queue from AGUARDANDO_TRIAGEM assets — per-item + bulk condition assessment + route to NO_GALPAO or DESCARTADO). API: GET/POST/PATCH/DELETE `/api/inventory`, GET `/api/inventory/awaiting-triage`, GET `/api/inventory/available/:franchise`, PATCH `/api/inventory/:id/triage`, POST `/api/events/:id/dispatch-inventory`, POST `/api/events/:id/return-inventory`, GET/POST `/api/events/:id/allocations`, DELETE `/api/allocations/:id`.

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