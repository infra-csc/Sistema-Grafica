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
- **Inventory Module (Acervo)**: Full inventory management for graphic production assets. `inventory_assets` table with displayId (#EST-XXXX), name, condition (PERFEITO/AVARIA_LEVE/SUCATA), location, franchise tags, availability toggle. `event_inventory_allocations` pivot links assets to events and toggles availability. Pages: `/estoque` (CRUD table with filter/search) and `/triagem-retorno` (post-event return triage — select delivered items, assess condition, bulk-send to inventory). API: GET/POST/PATCH/DELETE `/api/inventory`, GET `/api/inventory/available/:franchise`, GET/POST `/api/events/:id/allocations`, DELETE `/api/allocations/:id`.

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