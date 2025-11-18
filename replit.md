# NORTE - Sistema de Gestão de Produção Gráfica

## Overview
NORTE is a comprehensive graphic production management system designed for NORTE Marketing Esportivo. Its primary purpose is to replace Excel-based workflows, significantly enhancing agility, control, and traceability across the entire production lifecycle: Request → Art → Printing → Delivery. The system aims to streamline operations, provide real-time oversight, and ensure timely communication and automatic notifications at every stage. Key ambitions include improving operational efficiency, ensuring timely project completion, and providing a robust, scalable platform for managing graphic production.

## Recent Changes (November 18, 2025)
- **Status Badge Colors**: Implemented distinct colors for all workflow statuses to eliminate confusion. Each stage now has a unique visual appearance:
  - Solicitado (requested): Yellow
  - Aguardando Patrocinador (awaiting_sponsor_approval): Orange
  - Patrocinador Aprovou (sponsor_approved): Blue
  - Aguardando Revisão Final (awaiting_creator_review): Purple
  - Pronto p/ Produção (ready_for_production): Cyan
  - Liberado (approved): Green
  - Em Produção (inProduction): Production color
  - Produzido (produced): Fuchsia/Magenta (rosa, bem distinto do verde em ambos os modos)
  - Entregue (delivered): Completed green
- **Terminology Update**: Renamed "Aguardando Criador" to "Aguardando Revisão Final" to better reflect the final review step before production.
- **Status Badge Bug Fix**: Corrected issue where items with `skip_approval=true` in database were incorrectly showing as "Pronto" (pending) in Vincular Patrocinadores page. Badge status now correctly checks only original database values.
- **Painel Geral Data Loading**: Fixed query key from `/api/items/global` to `/api/items` to properly load all items with event data.
- **Display ID Visibility**: Confirmed Display IDs (#XXXX format) are properly displayed across all views including Painel Geral, with monospace font and primary color styling.

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