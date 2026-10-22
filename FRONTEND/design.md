---
name: DEWA
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3e4949'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6e7979'
  outline-variant: '#bec9c9'
  surface-tint: '#00696c'
  primary: '#005a5c'
  on-primary: '#ffffff'
  primary-container: '#0d7477'
  on-primary-container: '#a3f7fa'
  inverse-primary: '#81d4d7'
  tertiary: '#005c3f'
  on-tertiary: '#ffffff'
  tertiary-container: '#007752'
  on-tertiary-container: '#8bfec9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9df1f3'
  primary-fixed-dim: '#81d4d7'
  on-primary-fixed: '#002021'
  on-primary-fixed-variant: '#004f52'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

# Design System Guidelines

## 1. Brand Philosophy & Architecture

This system provides a modern, ultra-minimal clinical interface designed for rapid execution and clear information hierarchy. Built specifically around modern Next.js App Router conventions and Tailwind CSS, it prioritizes performance, legibility, and effortless scanning.

### Core Principles

- **Modern Minimal Realism**: Clean layouts without unnecessary visual noise or superfluous decorative layers.
- **Scannable Precision**: Key data (dosage, availability, distance) can be parsed instantly.
- **Trust & Authority**: Deep clinical teal and muted slate tones create a calm, highly professional medical atmosphere.

## 2. Color Tokens & Utility Setup

### Color Mapping (Tailwind Configuration)

```typescript
// tailwind.config.ts / css variables
colors: {
  primary: {
    DEFAULT: '#0D7477', // Deep Clinical Teal
    foreground: '#FFFFFF',
    hover: '#0A5C5E',
  },
  tertiary: {
    DEFAULT: '#059669', // Verified Emerald
    foreground: '#FFFFFF',
  },
  destructive: {
    DEFAULT: '#BE123C', // Stock Depleted / Danger
    foreground: '#FFFFFF',
  },
  background: '#F8FAFC', // Off-White Canvas
  surface: '#FFFFFF',    // Card Surface
  border: '#E2E8F0',     // Subtle Borders
  foreground: '#0F172A', // Slate Navy Text
  muted: {
    DEFAULT: '#F1F5F9',
    foreground: '#64748B',
  }
}
```

## 3. Typography & Numerical Layout

- **Headings**: `font-sans` (`Plus Jakarta Sans`) — Clean, modern geometric display.
- **Body & Controls**: `font-sans` (`Inter`) — High legibility UI typography.
- **Tabular Figures**: Numerical elements (inventory counts, dosage, NDC codes, timers) must always use `tabular-nums` (`font-variant-numeric: tabular-nums`) to prevent layout shifts during live data re-renders.

## 4. UI Primitives (`shadcn/ui` + `lucide-react`)

### Buttons (`shadcn/ui Button`)

- **Primary**: `<Button className="bg-[#0D7477] hover:bg-[#0A5C5E] text-white h-11 px-6 rounded-md font-medium">`
- **Secondary / Outline**: `<Button variant="outline" className="border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9]">`
- **Destructive**: `<Button variant="destructive" className="bg-[#BE123C] hover:bg-[#9F1239] text-white">`

### Status Badges (`shadcn/ui Badge`)

All badges use rounded pill borders with embedded `lucide-react` icons:

- **In Stock / Verified**:
  `<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> In Stock</Badge>`

- **Out of Stock**:
  `<Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5 text-rose-600" /> Depleted</Badge>`

- **Searching / Broadcasting**:
  `<Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin" /> Live Verification</Badge>`

### Medication Cards (`shadcn/ui Card`)

`<Card className="bg-white border border-[#E2E8F0] rounded-lg p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">`

- Left section: Generic drug name (`headline-sm`), brand name (`text-muted-foreground`), dosage form, and NDC code with `font-mono tabular-nums`.
- Right section: Metadata badges incorporating `MapPin`, `Package`, and `Clock` icons from `lucide-react`.

### Search Input (`shadcn/ui Input`)

- `<Input className="h-12 bg-white border-[#CBD5E1] focus-visible:ring-2 focus-visible:ring-[#0D7477]/20 placeholder:text-slate-400 text-[#0F172A] pl-10" />`
- Accompanied by `<Search className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />`.

### Lists & Tables (`shadcn/ui Table`)

- Built with `Table`, `TableHeader`, `TableRow`, `TableHead`, and `TableCell`.
- Clean, minimal row separators with `border-b border-[#E2E8F0]`.