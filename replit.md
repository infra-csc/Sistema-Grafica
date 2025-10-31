# NORTE - Sistema de Gestão de Produção Gráfica

## Overview
NORTE is a comprehensive graphic production management system for NORTE Marketing Esportivo. Its main goal is to replace Excel spreadsheets, enhancing agility and providing complete control, traceability, and automatic notifications across the entire production workflow: **Request → Art → Printing → Delivery**. The system aims to streamline operations, improve oversight, and ensure timely communication at all stages.

## Recent Changes (October 31, 2025)
- **Client Management Removed - Items Now Link to Sponsors:**
  - Removed clients table from database schema
  - Items now link directly to sponsors via `sponsorId` field
  - Events support multiple sponsors (many-to-many via event_sponsors junction table)
  - Items support single sponsor selection (optional foreign key)
  - Frontend: Events use checkbox multi-select for sponsors, Items use dropdown single-select
- **Sponsor Linking Improvements:**
  - Event creation/editing: Uses Promise.all for parallel sponsor linking operations
  - Items: Properly omits sponsorId field when no sponsor selected (avoids sending empty strings)
  - Sponsor sync uses apiRequest consistently (no direct fetch calls)
  - Note: Current implementation lacks full atomic transactions (documented for future improvement)
- **Multi-stage approval workflow fully implemented:**
  - Backend API routes for sponsor management with admin-only access
  - New approval routes with status validation and role-based authorization
  - Three-stage approval: Arte → Atendimento (sponsor) → Solicitação (creator) → Production
- **Approval Routes Created:**
  - `/api/items/:id/submit-for-approval` - Arte submits with approval thumb
  - `/api/items/:id/sponsor-approve` - Atendimento approves for sponsor
  - `/api/items/:id/creator-review` - Solicitação reviews and releases to production
  - All routes validate current item status before transition (409 on invalid state)
  - All routes enforce role-based access (403 on unauthorized role)
- **Arte Page Implementation (October 31, 2025):**
  - Created generic FileUploader component for file uploads (images, PDFs, etc.) using object storage
  - **Tabbed Interface Refactoring (October 31, 2025):**
    - Refactored Arte page to use Shadcn Tabs component for clear visual separation of work stages
    - Three distinct tabs with badge counters showing filtered item counts:
      1. **"Criar Aprovações"** (FileImage icon): Items with status `requested` - Arte creates approval thumbs
      2. **"Finalizar Layouts"** (Upload icon): Items with status `sponsor_approved` - Arte uploads final files
      3. **"Aprovados"** (CheckCircle icon): All other workflow statuses (historical view)
    - Badge counters respect ALL active filters (event, type, material, finish, month, next 10 days)
    - Tab-specific functionality:
      - "Criar Aprovações": Shows checkbox column for bulk selection, Upload icon for actions
      - "Finalizar Layouts": Upload icon for adding final files
      - "Aprovados": Eye icon for view-only, Status column visible
    - Empty state messages customized per tab
    - Maintained all existing filters and functionality (event filter, advanced filters, search, date ranges)
  - **Shared PDF Upload (Batch Processing):**
    - Multi-selection UI with checkboxes in "Criar Aprovações" tab
    - Checkbox in table header for "Select All" functionality
    - Upload button appears when items are selected: "Upload PDF Compartilhado (N)"
    - Dialog for uploading single PDF to be applied to all selected items
    - Shows list of selected items with event, type, and description
    - Single PDF upload using FileUploader component
    - Promise.all-based mutation submits all items in parallel with same PDF URL
    - Each item maintains individual approval workflow (approval per piece, not per batch)
    - After submission, all items transition to `awaiting_sponsor_approval` status
    - Selection cleared and cache invalidated after successful submission
- **Atendimento Page Implementation (October 31, 2025):**
  - Created `/atendimento` page for sponsor approval workflow
  - **Refactored to Table Layout with Filters:**
    - Changed from grid of cards to responsive table layout
    - Search filter by description/type/name with clear button (X icon)
    - Event filter dropdown (Select) with all available events
    - Item type filter dropdown (Select) with unique types
    - "Limpar" button appears when any filter is active
    - Table columns: Evento, Tipo, Descrição, Qtd, Patrocinador, Saída Caminhão, Ações
    - Visual grouping by event with gradient headers and event info
    - Displays items with status `awaiting_sponsor_approval`
    - Memoized filtering logic for performance (useMemo)
    - Badge with counter showing pending items count
    - Empty states differentiated: "Nenhum item pendente" vs "Nenhum resultado encontrado"
  - Review dialog with full-size image and complete details (unchanged)
  - Approve button calls `/api/items/:id/sponsor-approve` to transition to `sponsor_approved`
  - **Access Control (Layered Security):**
    - Created `RoleProtectedRoute` component for role-based route protection
    - Route restricted to "atendimento" and "admin" roles only
    - Sidebar link filtered - only authorized roles see menu item
    - Backend validates roles with 403 response on unauthorized access
    - Defense in depth: both frontend and backend enforce access control
- **Solicitação (Creator Review) Page Implementation (October 31, 2025):**
  - Created `/solicitacao` page for final creator review before production
  - Displays items with status `sponsor_approved` in grid cards
  - Shows approval thumbs, item details, and complete approval history
  - Review dialog with full-size image, final file link, and approval timeline
  - Shows checkmarks for Arte and Patrocinador approvals with timestamps
  - "Liberar para Produção" button calls `/api/items/:id/creator-review` to transition to `ready_for_production`
  - Counter displays pending items count
  - Empty state when no items await review
  - **Access Control (Layered Security):**
    - Route restricted to "solicitacao" and "admin" roles using RoleProtectedRoute
    - Sidebar link filtered - only authorized roles see menu item
    - Backend validates roles with 403 response on unauthorized access
    - Defense in depth: both frontend and backend enforce access control
- **Multi-Stage Approval Notification System (October 31, 2025):**
  - Complete notification workflow for all approval stages:
    1. Arte submits → Notifies "atendimento" profile
    2. Atendimento approves → Notifies "solicitacao" profile
    3. Solicitação releases → Notifies "arte" and "grafica" profiles
  - All notifications include item type and event name for context
  - Real-time WebSocket broadcasts for instant UI updates
  - Audit trail with timestamps: `sponsorApprovedAt`, `creatorReviewedAt`
  - Type-safe timestamp fields (Date objects, not strings)

## User Preferences
I prefer concise and clear explanations. I want iterative development with frequent, small updates rather than large, infrequent ones. Always ask for confirmation before making significant changes to the codebase or architectural decisions. Do not make changes to the `shared/schema.ts` file without explicit instruction.

## System Architecture

### UI/UX Decisions
The system features a professional light mode theme with a clean white background, subtle borders, and brand gradients in the header. The UI prioritizes simplicity, agility, visual control through color-coded statuses, and intelligent notifications. Key visual elements include a client logo in the sidebar, a defined color palette (NORTE Blue, Cyan, Magenta, Purple), and status colors (Green, Yellow, Red, Blue, Orange). The dashboard includes real-time statistics, a filterable table, visual graphs, urgent alerts, and expanded statistics. A calendar provides a monthly grid with status-based coloring and alerts, and a history section offers a vertical timeline of activities.

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
- **Modules**: General Panel (Dashboard), Events, Items (Event Detail), Art Approval, Printing Control, Templates, Calendar, History, Sponsors.
- **Notifications**: Automated for event creation, item additions, art approval, and deadline alerts (48h, 24h, 12h before truck departure).
- **Item Statuses**: `requested`, `awaiting_sponsor_approval`, `sponsor_approved`, `awaiting_creator_review`, `ready_for_production`, `approved`, `inProduction`, `produced`, `delivered`.
- **Event Statuses**: `created`, `completed`, `urgent`.
- **User Authentication & Access Control**: Full login/logout, Bcryptjs for passwords, mandatory first-time password change, user management (Admin), 5 user profiles (Admin, Solicitation, Art, Graphics, Atendimento) with route protection and `hasPermission()` checks.
- **Multi-Stage Approval Workflow**: Events can have multiple sponsors; items link to a single sponsor (optional); sponsor approval required before creator review; Arte uploads approval thumbs and final files; creator reviews and releases to production.
- **Sponsor Management**: Full CRUD for sponsors (admin-only); events support multiple sponsors via checkboxes; items support single sponsor via dropdown; no client management (clients removed).
- **Intelligent Notification System**: Notifications targeted to specific user roles based on event type. Admin users see ALL notifications for complete system oversight.
- **Audit Logs**: Automatic logging of significant actions (event/item creation, approval, delivery) including user, timestamp, action, entity type/ID, and details, viewable in History and Event Details.
- **Admin Edit/Delete**: Functionality for Admin users to edit and delete events and items with corresponding audit logs and confirmation dialogs.
- **Event Priority System**: Events can have priorities (Low, Medium, High, Urgent), displayed visually with badges and influencing calendar coloring.
- **Automatic Event Status**: Events are marked "completed" when all items are delivered; status reverts if new items are added to a completed event.
- **Approval Assets**: Items track approval thumbnail URLs (for sponsor review) and final file URLs (required before production).

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