# NORTE - Sistema de Gestão de Produção Gráfica

## Overview

NORTE is a comprehensive graphic production management system developed for NORTE Marketing Esportivo. Its primary purpose is to replace Excel spreadsheets, enhancing agility while providing complete control, traceability, and automatic notifications for the entire production workflow: **Request → Art → Printing → Delivery**. The system aims to streamline operations, improve oversight, and ensure timely communication across all stages.

## User Preferences

I prefer concise and clear explanations. I want iterative development with frequent, small updates rather than large, infrequent ones. Always ask for confirmation before making significant changes to the codebase or architectural decisions. Do not make changes to the `shared/schema.ts` file without explicit instruction.

## System Architecture

### UI/UX Decisions
The system features a professional light mode theme with a clean white background, subtle borders, and brand gradients in the header. The UI prioritizes simplicity, agility, visual control through color-coded statuses, and intelligent notifications. Key visual elements include:
- **Client Logo**: Displayed in the sidebar header.
- **Color Palette**:
    - NORTE Blue (Primary): 210 70% 25% (main buttons, important elements)
    - NORTE Cyan (Accent): 188 100% 42% (secondary actions, links)
    - NORTE Magenta: 330 65% 50% (decorative highlights)
    - NORTE Purple: 280 55% 45% (alternative accent)
- **Status Colors**: Green (Completed), Yellow (Created/Requested), Red (Urgent/Late), Blue (Approved/In Process), Orange (In Production).
- **Dashboard**: Features real-time statistics cards, a complete table with filters and search, and visual status indicators. Includes visual graphs (pie for status, bar for items per event), urgent alerts with countdowns, and expanded statistics (average approval/production time, delivery rate, most produced item).
- **Calendar**: Monthly grid displaying events with status-based coloring for `startDate` and `truckDepartureDate`, visual alerts for critical deadlines, and a discreet legend.
- **History**: Vertical timeline with chronological activities, filterable by event, showing icons, badges, detailed descriptions, and relative/exact timestamps.

### Technical Implementations
- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI.
- **Backend**: Express.js, TypeScript.
- **Database**: PostgreSQL (Neon).
- **Real-time Communication**: WebSockets for notifications and live updates.
- **Data Validation**: Zod schemas (used in both frontend and backend).
- **ORM**: Drizzle ORM.
- **State Management/Data Fetching**: React Query for data caching and synchronization.
- **Timezone Handling**: Database stores UTC timestamps; JavaScript handles conversions between UTC and the browser's local timezone (Brasília - UTC-3).

### Feature Specifications
- **Modules**:
    - **General Panel (Dashboard)**: Real-time overview of all items, statistics, and a filterable table.
    - **Events**: Management of events with visual cards, creation forms, and status indicators.
    - **Items (Event Detail)**: Addition of graphic items to events, automatic m² calculation, observations per item. Items cannot be modified after creation, only added.
    - **Art**: Approval module for print files with pending/approved views, bulk approval, and notifications.
    - **Printing**: Control of material delivery, tracking delivered items, and capturing delivery details (recipient, optional photo).
    - **Templates**: Creation and management of reusable standard item templates.
    - **Calendar**: Visual temporal overview of events with critical date alerts.
    - **History**: Chronological timeline of all system activities with event filtering.
- **Notifications**: Automated for event creation, item additions, art approval, and deadline alerts (48h, 24h, 12h before truck departure).
- **Item Statuses**: `requested`, `approved`, `inProduction`, `produced`, `delivered`.
- **Event Statuses**: `created`, `completed`, `urgent`.
- **Future Features (Phase 2)**: User access profiles (Admin, Request, Art, Printing), integrated comments and delivery photo galleries for items, visible audit logs, event templates, and manual confirmation for significant changes.

### System Design Choices
- **Folder Structure**: Clearly separated client, server, and shared directories.
- **Component-Based**: Reusable UI components for consistency.
- **API Endpoints**: RESTful API for managing events, items, standard items, and notifications.
- **Scalability**: Designed with a robust backend and database to support future growth.
- **Responsiveness**: Full responsiveness for mobile, tablet, and desktop.

## External Dependencies

- **Database**: PostgreSQL (managed by Neon).
- **Frontend Libraries**: React, Tailwind CSS, Shadcn UI.
- **Backend Framework**: Express.js.
- **Data ORM**: Drizzle ORM.
- **Validation Library**: Zod.
- **Real-time Communication**: WebSockets.