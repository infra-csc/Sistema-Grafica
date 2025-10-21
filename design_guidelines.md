# Design Guidelines: NORTE - Sistema de Gestão de Produção Gráfica

## Brand Identity

**Client**: NORTE Marketing Esportivo  
**Logo Colors**: Azul escuro, Rosa/Magenta, Roxo/Violeta, Turquesa/Ciano  
**Design Approach**: Clean, professional, modern light theme with brand color accents

## Core Design Principles

1. **Information Clarity**: Data-heavy interface with excellent readability
2. **Visual Status System**: Instant recognition through consistent color coding
3. **Professional Aesthetics**: Clean white backgrounds with subtle borders and gradients
4. **Brand Integration**: NORTE colors used strategically for accents and visual hierarchy
5. **Fast Workflow**: Replacing spreadsheet efficiency with better control and tracking

---

## Color Palette

### NORTE Brand Colors (Primary System)
- **NORTE Blue** (Primary): 210 70% 25% - Header, main CTA buttons, important elements
- **NORTE Cyan** (Accent): 188 100% 42% - Secondary actions, highlights, links
- **NORTE Magenta**: 330 65% 50% - Special highlights, alerts (decorative)
- **NORTE Purple**: 280 55% 45% - Alternative accent (decorative)

### Light Theme (Default)
- **Background**: 0 0% 100% (pure white)
- **Surface (Cards)**: 0 0% 100% (white)
- **Border**: 220 13% 91% (subtle gray)
- **Text Primary**: 220 15% 15% (dark slate)
- **Text Secondary**: 220 10% 46% (medium gray)
- **Muted Background**: 220 13% 95% (very light gray for alternating rows)

### Status Colors (Critical System Feature)
These colors communicate workflow status and are never changed:
- **Green (Finalizado)**: 142 76% 36% - Events completed, items delivered
- **Yellow (Criado/Aguardando)**: 45 93% 47% - Newly created, awaiting action
- **Red (Urgente)**: 0 84% 60% - Less than 48h to deadline, critical alerts
- **Blue (Liberado)**: 217 91% 60% - Released by Arte, ready for production
- **Orange (Em Produção)**: 25 95% 53% - Active production status

### Interaction & Feedback
- **Primary Action**: NORTE Blue (210 70% 25%)
- **Secondary Action**: NORTE Cyan (188 100% 42%)
- **Success**: Green (142 76% 36%)
- **Warning**: Yellow (45 93% 47%)
- **Error**: Red (0 84% 60%)
- **Hover Elevation**: rgba(0,0,0, .03)
- **Active Elevation**: rgba(0,0,0, .08)

---

## Typography

**Font Family**: Inter (via Google Fonts CDN) - exceptional readability for data-intensive applications

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

**Spacing Primitives**: Tailwind units 2, 3, 4, 6, 8, 12, 16
- Component padding: p-4 or p-6
- Section spacing: gap-4 or gap-6
- Page margins: px-6 lg:px-8
- Card spacing: p-6
- Form field spacing: space-y-4

**Grid System**:
- Main layout: Sidebar + main content area
- Event cards: grid-cols-1 md:grid-cols-2 xl:grid-cols-3
- Status panels: Full-width responsive tables with horizontal scroll

**Container Widths**:
- Sidebar: 256px (customizable via SidebarProvider)
- Main content: Full width minus sidebar
- Modal dialogs: max-w-2xl for forms, max-w-4xl for data views

---

## Component Library

### Branding Header (Sidebar)
**Logo + Brand Identity**:
- Logo: 40x40px rounded square with white background padding
- Brand name: "NORTE" in NORTE Blue (primary color), font-semibold
- Tagline: "Marketing Esportivo" in muted-foreground, text-xs
- Background: Gradient from NORTE Blue/8 via Magenta/8 to Cyan/8
- Height: 64px fixed

### Navigation (Sidebar)
**Persistent Left Sidebar**:
- Background: White (0 0% 100%)
- Border: Subtle gray (220 13% 91%)
- Nav items: Shadcn SidebarMenuButton components
- Active state: NORTE Blue background highlight
- Hover: Subtle elevation with hover-elevate utility
- Sections: Painel Geral, Eventos, Arte, Gráfica, Modelos, Calendário

### Data Tables (Core Component)
**Structure**:
- Header: background muted (220 13% 95%), text-xs font-medium uppercase
- Row height: 48px minimum for comfortable scanning
- Zebra striping: bg-muted/30 (very subtle alternating rows)
- Hover: hover-elevate utility for subtle background change
- Borders: border-b border-border (subtle separation)

**Status Indicators in Tables**:
- Status badge component with proper color + icon
- Background: status color at 20% opacity
- Text: status color at full saturation
- Icons: Lucide icons (CheckCircle, Clock, Truck, AlertCircle, etc.)

### Cards
**Event Cards & Info Panels**:
- Background: White (card)
- Border: 1px solid border color
- Border-radius: rounded-lg (8px)
- Padding: p-6
- Shadow: Minimal, elevated on hover
- Header: Bold title + metadata row
- Body: Key information, progress indicators
- Footer: Status badge + action buttons

### Forms
**Input Fields** (Shadcn components):
- Background: White
- Border: 1px solid border color
- Focus: NORTE Blue ring
- Height: Default from Shadcn Button sizes
- Labels: above inputs, text-sm font-medium mb-2
- Validation: Inline errors in red below fields

**Buttons** (Shadcn Button component):
- Primary: NORTE Blue background, white text
- Secondary: muted background
- Outline: border with transparent background
- Destructive: red background
- Sizes: default, sm, lg, icon
- Never manually add hover states - use built-in elevation

### Status Indicators
**Visual System**:
- **Badges**: StatusBadge component with icon + text, rounded-md, px-2 py-1
- **Calendar Events**: Full-day blocks with status color background
- **Alert Cards**: Border-l-4 with status color + matching background tint

### Notifications
**Toast Notifications** (Shadcn Toaster):
- Position: bottom-right
- Slide-in animation
- Icon + title + description
- Auto-dismiss after 4s (except critical)
- Color-coded by variant (default/success/warning/destructive)

### Calendar View
**Month Grid**:
- 7-column grid for weekdays
- Event indicators: colored badges with event count
- Alert badges for <48h deadlines (red)
- Countdown timer cards for urgent events
- Click event: navigate to event detail

### Painel de Status Geral (Dashboard)
**Real-time Overview**:
- Summary cards: grid-cols-1 md:grid-cols-5 with statistics
- Full-width table with all items from all events
- Filters: Select dropdowns for status and search input
- Color-coded status badges in table
- Live updates via WebSocket
- Responsive: horizontal scroll on mobile

---

## Images & Media

**Logo**:
- NORTE logo displayed in sidebar header
- Size: 40x40px rounded with white background padding
- Alt text: "NORTE Marketing Esportivo"

**Production Photos** (Gráfica module):
- User-uploaded photos of finished items
- Display: responsive with proper aspect ratio
- Upload area: dashed border with icon + label
- Future enhancement: thumbnail gallery

---

## Animations

**Minimal & Purposeful**:
- Page transitions: Smooth, no animations needed (Wouter handles routing)
- Modal entry: Shadcn Dialog default animations
- Notifications: Slide-in from bottom-right (Shadcn Toast)
- Status updates: Instant, no animation (real-time is the feature)
- Loading states: Simple spinner or skeleton (Shadcn components)
- Hover: Subtle elevation via hover-elevate utility class

---

## Accessibility

- **WCAG AA Compliance**: 4.5:1 text contrast, 3:1 UI contrast
- **Status Communication**: Color + icon + text label (never color alone)
- **Keyboard Navigation**: Full support, visible focus rings in NORTE Blue
- **Screen Readers**: Proper ARIA labels on icon buttons and interactive elements
- **Form Validation**: Clear inline error messages
- **Touch Targets**: Minimum 44px for all interactive elements

---

## Responsive Strategy

**Breakpoints**:
- **Mobile** (< 768px): 
  - Collapsible sidebar with toggle button
  - Single-column card layouts
  - Horizontal scroll for tables with sticky first column
  - Full-width buttons and forms
  
- **Tablet** (768px - 1024px):
  - Sidebar can collapse/expand
  - 2-column card grids
  - Tables with horizontal scroll
  
- **Desktop** (> 1024px):
  - Persistent sidebar (256px)
  - 3-column card grids
  - Full-width tables with all columns visible
  - Optimal data density

**Mobile Optimizations**:
- Tables: Horizontal scroll, sticky event name column
- Forms: Full-width inputs, larger touch targets
- Calendar: Responsive grid with smaller cells
- Navigation: Hamburger menu for sidebar toggle

---

## Component Usage Rules

1. **Always use Shadcn components** from `@/components/ui/*`
2. **Never add custom hover states** to Buttons/Badges - use built-in elevation
3. **Use StatusBadge component** for all status indicators
4. **Apply data-testid** to all interactive and important display elements
5. **Follow color tokens** - never use arbitrary colors like bg-blue-500
6. **Use hover-elevate and active-elevate-2** utilities for custom interactive elements
7. **Maintain consistent spacing** - stick to defined spacing primitives

---

## File Structure

```
client/src/
├── components/
│   ├── ui/              # Shadcn components
│   ├── app-sidebar.tsx  # Navigation with NORTE branding
│   ├── notification-bell.tsx
│   └── status-badge.tsx # Reusable status indicator
├── pages/
│   ├── painel-geral.tsx  # Dashboard
│   ├── eventos.tsx       # Events list
│   ├── event-detail.tsx  # Event items
│   ├── arte.tsx          # Art approval
│   ├── grafica.tsx       # Production tracking
│   ├── modelos.tsx       # Templates
│   └── calendario.tsx    # Calendar view
├── hooks/
│   └── use-websocket.ts  # Real-time updates
└── lib/
    └── queryClient.ts    # React Query config
```

---

## Design System Summary

**Primary Colors**: NORTE Blue + NORTE Cyan  
**Theme**: Light mode with clean white backgrounds  
**Status System**: 5 colors (green, yellow, red, blue, orange)  
**Typography**: Inter font throughout  
**Components**: Shadcn UI with custom StatusBadge  
**Spacing**: Consistent 4px/8px/16px/24px scale  
**Elevation**: Subtle hover/active states via utility classes  
**Real-time**: WebSocket updates with toast notifications
