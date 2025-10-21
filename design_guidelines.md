# Design Guidelines: Sistema de Gestão de Produção Gráfica

## Design Approach

**Selected Approach**: Design System + Reference Hybrid  
**Primary References**: Linear (project management clarity), Notion (flexible data views), Asana (status tracking)  
**System Foundation**: Material Design principles for data-heavy applications

**Core Principles**:
- Information density without overwhelming
- Instant visual status recognition through color coding
- Fast data entry and updates (replacing spreadsheet efficiency)
- Clear separation between modules while maintaining consistency

---

## Color Palette

### Dark Mode (Primary)
- **Background**: 220 15% 10% (dark slate)
- **Surface**: 220 12% 14% (elevated panels)
- **Surface Elevated**: 220 10% 18% (cards, modals)
- **Border**: 220 10% 25%
- **Text Primary**: 0 0% 95%
- **Text Secondary**: 220 5% 65%

### Status Colors (Critical System Feature)
- **Green (Finalizado)**: 142 76% 36% - Events completed, items delivered
- **Yellow (Criado/Aguardando)**: 45 93% 47% - Newly created, awaiting action
- **Red (Urgente)**: 0 84% 60% - Less than 48h to deadline, delays
- **Blue (Em Processo)**: 217 91% 60% - Released by Arte, in production
- **Orange (Produção)**: 25 95% 53% - Active production status

### Accent & Interaction
- **Primary Action**: 217 91% 60% (blue for CTAs)
- **Hover State**: 217 91% 55%
- **Success Feedback**: 142 76% 36%
- **Warning**: 45 93% 47%
- **Error**: 0 84% 60%

---

## Typography

**Font Family**: Inter (via Google Fonts CDN) - exceptional readability for dense data

**Hierarchy**:
- **Page Titles**: text-2xl (24px), font-semibold, tracking-tight
- **Section Headers**: text-lg (18px), font-semibold
- **Card Titles**: text-base (16px), font-medium
- **Body Text**: text-sm (14px), font-normal
- **Table Data**: text-sm (14px), font-normal, tabular-nums for numbers
- **Labels**: text-xs (12px), font-medium, uppercase, tracking-wide
- **Status Badges**: text-xs (12px), font-semibold

---

## Layout System

**Spacing Primitives**: Tailwind units 2, 4, 6, 8, 12, 16
- Component padding: p-4 or p-6
- Section spacing: gap-6 or gap-8
- Page margins: px-6 lg:px-8
- Card spacing: p-6

**Grid System**:
- Main dashboard: 12-column grid with sidebar
- Event cards: grid-cols-1 md:grid-cols-2 xl:grid-cols-3
- Status panels: Full-width responsive tables

**Container Widths**:
- Sidebar: w-64 (256px) fixed
- Main content: max-w-7xl mx-auto
- Modal dialogs: max-w-2xl for forms, max-w-6xl for data views

---

## Component Library

### Navigation
**Sidebar Navigation** (persistent left)
- Width: 256px, dark background 220 15% 10%
- Logo area: 64px height
- Nav items: py-2 px-4, icon + label, hover background 220 12% 18%
- Active state: blue accent border-l-2, background 220 10% 18%
- Sections: Eventos, Itens, Arte, Gráfica, Modelos, Calendário, Painel Geral

### Data Tables (Core Component)
**Structure**:
- Header: background 220 10% 18%, text-xs uppercase tracking-wide
- Row height: 48px minimum for touch targets
- Zebra striping: alternate rows background 220 12% 14%
- Hover: background 220 10% 16%
- Borders: border-b border-220-10-25

**Status Indicators in Tables**:
- Leading color bar: border-l-4 with status color
- Status badge: px-2 py-1 rounded text-xs font-semibold
- Icons: Heroicons for status (CheckCircle, Clock, Truck, etc.)

### Cards
**Event Cards**:
- Background: 220 12% 14%
- Border: 1px solid status color with opacity
- Border-radius: rounded-lg (8px)
- Padding: p-6
- Shadow: subtle on hover
- Header: Event name + date range
- Body: Progress indicators, item count
- Footer: Status badge + action buttons

### Forms
**Input Fields**:
- Background: 220 10% 18%
- Border: 1px solid 220 10% 25%
- Focus: blue ring with offset
- Height: h-10 (40px) for text inputs
- Padding: px-4
- Labels: above inputs, text-sm font-medium mb-2

**Buttons**:
- Primary: blue background, text-white, px-4 py-2, rounded-md
- Secondary: border border-220-10-25, background transparent
- Danger: red background for destructive actions
- Icon buttons: p-2, hover background circle

### Status Indicators
**Visual System**:
- **Badges**: Rounded-full px-3 py-1, status color background at 20% opacity, border with status color
- **Progress Bars**: 4px height, rounded-full, status color fill
- **Timeline Dots**: 8px circle, border-2, status color
- **Calendar Events**: Full-day blocks with status color background gradient

### Notifications
**Toast Notifications** (top-right):
- Width: 384px
- Slide-in animation
- Icon + message + dismiss
- Auto-dismiss after 5s (except critical alerts)
- Color-coded by type (info/success/warning/error)

### Calendar View
**Month Grid**:
- 7-column grid for days
- Event indicators: colored dots below date
- Hover: show event names in tooltip
- Click: open event details modal
- Alert badges for <48h deadlines

### Painel de Status Geral
**Real-time Dashboard**:
- Full-width table with horizontal scroll
- Sticky header and first column (event name)
- Color-coded rows by status
- Quick filters: chips above table for status/event/date
- Live update indicators: subtle pulse animation on changed rows
- Summary cards at top: Total items, By status counts, Urgent alerts

---

## Images

**No hero images required** - This is a data-focused application where the dashboard itself is the hero. All visual interest comes from:
- Well-organized data tables
- Color-coded status indicators  
- Clean typography and spacing
- Functional iconography (Heroicons for all UI icons)

**Photos in Gráfica Module**:
- Production photos uploaded by users
- Display in 16:9 aspect ratio containers
- Thumbnail grid: grid-cols-3 gap-2
- Lightbox on click for full view
- Upload area: dashed border, centered icon + text

---

## Animations

**Minimal & Purposeful**:
- Page transitions: fade (150ms)
- Modal entry: scale + fade (200ms)
- Notification slides: slide-in-right (300ms)
- Status updates: subtle pulse (1 cycle)
- Loading states: spinner only, no skeleton screens
- No scroll-driven animations

---

## Accessibility

- Maintain WCAG AA contrast ratios (4.5:1 text, 3:1 UI)
- Status communicated by color + icon + text label
- Keyboard navigation: focus visible with blue ring
- Screen reader labels on icon-only buttons
- Form validation: inline errors below fields
- Alert notifications: role="alert" for screen readers

---

## Responsive Strategy

**Breakpoints**:
- Mobile (< 768px): Stack all content, hide sidebar (hamburger menu), single-column cards
- Tablet (768-1024px): Collapsible sidebar, 2-column grids
- Desktop (> 1024px): Full layout with persistent sidebar, 3-column grids

**Mobile Optimizations**:
- Tables: horizontal scroll with sticky first column
- Cards: full-width stack
- Forms: full-width inputs with larger touch targets (h-12)
- Calendar: list view instead of grid