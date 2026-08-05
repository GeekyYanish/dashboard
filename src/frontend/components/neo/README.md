# The `neo` layer

Every visual decision in this console comes from two rules. Break either one and
the whole thing stops looking designed.

## Rule 1 — The surface ladder

Neumorphism only reads correctly when an element's background **equals its
parent's**. A raised card inside a raised card produces mud: the inner shadow
falls on a surface that is already shadowed, and both lose their edge.

| Level | What it is | Used for |
|---|---|---|
| **L0** | The canvas. Flat, never shadowed. | Page background |
| **L1** | Raised or inset. `neo-raised*`, `neo-inset*`, `neo-pressed` | Cards, KPI tiles, buttons, toggles, chart frames, the sidebar |
| **L1c** | The content plane. Flat, lighter tint, no shadow. `neo-plane` | Table interiors, dense forms, list rows — anything with many repeating children |
| **L2** | Floating. Real drop shadow, escapes the ladder. `neo-float` | Modals, popovers, dropdowns, the command palette, toasts |

**A raised element may never contain another raised element.** Inside an L1
card, express depth with an *inset* well, or drop to the L1c plane.

### Why L1c exists

It is the pressure valve. Full neumorphism on a 3,100-row table fails twice:

- **Legibility.** Extruded surfaces carry almost no contrast of their own, so
  rows stop separating from each other exactly when there are most of them.
- **Performance.** Two shadow passes per row × 3,100 rows is a lot of paint.

So `NeoCard` is raised and `NeoCard.Body` is the flat plane. The frame still
reads as soft-UI; the data inside stays crisp. That seam is a single documented
boundary rather than a judgement call made per component.

```tsx
<NeoCard>                     {/* L1 — raised, soft */}
  <NeoCard.Header title="Registrations" />
  <NeoCard.Body>              {/* L1c — flat, crisp */}
    <DataTable … />
  </NeoCard.Body>
</NeoCard>
```

## Rule 2 — Colour is data

The chrome is monochrome: graphite ink on warm porcelain. Hue is reserved for
**status**, and for nothing else.

- A green pill always means money arrived. It never means "primary button".
- Primary buttons are graphite. Secondary buttons are the base surface.
- The one accent — signal orange — appears only on the live indicator, the
  active-nav marker, focus rings and the brand mark.

This is what keeps a screen with eleven status colours on it readable: the eye
learns that colour carries meaning, so it stops filtering it out as decoration.

## Affordance without borders

Soft surfaces have weak edges, so state does the work instead:

- **Hover** — lift (shadow grows, element translates up 1px)
- **Active** — press (`neo-pressed`, translate down 1px)
- **Focus** — a real 2px signal-orange ring, in both themes, no exceptions.
  A soft shadow is *not* a focus indicator.
- **Disabled** — flatten to `neo-flat` and drop to 45% opacity

## Two families of primitive

**Neumorphic** (L1/L2, soft): `NeoCard` `NeoStatTile` `NeoButton` `NeoIconButton`
`NeoSearchField` `NeoToggle` `NeoSegmented` `NeoTabs` `NeoProgress` `NeoRing`
`NeoAvatar` `NeoModal` `NeoDrawer` `NeoPopover` `NeoTooltip` `NeoStepper`
`NeoSkeleton` `NeoToast`

**Plane-level** (L1c, flat and high-contrast — must live inside a
`NeoCard.Body`): `DataTable` `Input` `Select` `Checkbox` `StatusBadge`
`Pagination` `FilterBar` `EmptyState` `KeyValue`

If you find yourself wanting a raised control inside a table row, that is the
ladder telling you the row should have opened a drawer instead.
