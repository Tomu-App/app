---
name: Tomu web app
description: A shared list as a large-print tear-off calendar sheet on a blue board.
colors:
  board: "#233a8c"
  board-dark: "#14235f"
  board-ink: "#ffffff"
  board-text: "#233a8c"
  board-text-dark: "#9db4ff"
  select: "#233a8c"
  select-dark: "#3a58c4"
  sheet: "#ffffff"
  sheet-dark: "#17191f"
  ink: "#141414"
  ink-dark: "#f0f0f0"
  ink-soft: "#5c5c5c"
  ink-soft-dark: "#a9adb8"
  open: "#c41c17"
  open-dark: "#ff7a70"
  perf: "#8a8a8a"
  perf-dark: "#7b7f8c"
  focus: "#1d4ed8"
  focus-dark: "#8fb4ff"
typography:
  count:
    fontFamily: "Archivo Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(5rem, 28vw, 7rem)"
    fontWeight: 900
    lineHeight: 0.8
    letterSpacing: "-0.02em"
    fontVariation: "font-stretch 70%"
  count-row:
    fontFamily: "Archivo Variable, Arial Narrow, sans-serif"
    fontSize: "3rem"
    fontWeight: 900
    lineHeight: 1
    fontVariation: "font-stretch 70%"
  wordmark:
    fontFamily: "Archivo Variable, Arial Narrow, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 900
    letterSpacing: "0.02em"
    fontVariation: "font-stretch 70%"
  title:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.1
  row-title:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.15
  item:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 400
    lineHeight: 1.25
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
  button:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 700
  label-caps:
    fontFamily: "Atkinson Hyperlegible Next Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    letterSpacing: "0.04em"
rounded:
  base: "6px"
  mark: "4px"
  switch: "1rem"
spacing:
  tap: "3rem"
  field-height: "3.5rem"
  add-height: "3.75rem"
  item-row: "4rem"
  list-row: "4.5rem"
  sheet-pad: "1.25rem"
  sheet-max: "40rem"
  gap-sm: "0.5rem"
  gap-md: "0.75rem"
  gap-lg: "1rem"
components:
  button-solid:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.base}"
    padding: "0 1.25rem"
    height: "{spacing.tap}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "0 1.25rem"
    height: "{spacing.tap}"
  button-add:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.base}"
    size: "{spacing.add-height}"
  text-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "0 0.75rem"
    height: "{spacing.field-height}"
  board-bar:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-ink}"
  sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "1.25rem 1.25rem 2.5rem"
    width: "{spacing.sheet-max}"
  item-row:
    textColor: "{colors.ink}"
    typography: "{typography.item}"
    height: "{spacing.item-row}"
  item-row-done:
    textColor: "{colors.ink-soft}"
    typography: "{typography.item}"
  item-box:
    rounded: "{rounded.base}"
    size: "2.1rem"
  item-box-done:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.base}"
    size: "2.1rem"
  new-mark:
    textColor: "{colors.open}"
    rounded: "{rounded.mark}"
    padding: "0 0.4rem"
  list-row:
    textColor: "{colors.ink}"
    typography: "{typography.row-title}"
    height: "{spacing.list-row}"
  label-tag-private:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.base}"
    padding: "0.1rem 0.6rem"
  label-tag-shared:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-ink}"
    rounded: "{rounded.base}"
    padding: "0.1rem 0.6rem"
  undo-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    padding: "0.5rem 1.25rem"
  dialog:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "1.25rem"
    width: "34rem"
---

# Design System: Tomu web app

## Overview

**Creative North Star: "The Tear-Off Calendar"**

Every list is today's calendar sheet. A white sheet sits on a blue cardboard backing. The sheet carries one huge condensed number (how many entries are still open), big plain rows, and a dashed perforation. Ticked entries sink below the perforation and are torn off with one button. The product is built for an older person on a phone first, so everything is large, thick-lined, and fixed in place: label, title and count always sit in the same spots on every sheet.

The type is two voices only. A tall, narrow, extra-bold face carries numbers and the wordmark. A large, very legible grotesque carries everything else. State is always readable from shape as well as colour: ticked means struck through and below the perforation, offline means a dashed sheet edge and a hollow dot, a switch is on when its knob sits to the right.

Colour is rationed. One red exists and it means "open right now". Everything else is ink, grey, white and one board blue. The large view (a switch in settings) raises the root size from 18px to 24px, so all rem-based type and targets grow by a third.

**Key Characteristics:**

- White sheet on a blue board, max 40rem wide, centred on wide screens.
- Thick lines: 3px for fields, boxes and buttons, 4px for the heading rule, 2px for row dividers.
- One accent red, reserved for what is open now.
- Monumental condensed count figure as the signature.
- Flat everywhere except dialogs.
- Light and dark schemes follow the system; the structure is identical.

## Colors

A blue board, a white sheet, near-black ink, and one calendar red. Greys do the quiet work.

### Primary

- **Board Blue** (#233a8c, dark #14235f): the page background and app bar behind the sheet, and the fill of shared-label tags. White text (#ffffff) sits on it. In dark scheme the board deepens so the sheet reads as the lit surface.
- **Board Text Blue** (#233a8c, dark #9db4ff): board blue used as text on the sheet (label capitals, section headings, shared-tag border). Lifted in dark so it stays readable.

### Secondary

- **Calendar Red** (#c41c17, dark #ff7a70): only for what is open right now: the open count (list sheet and list rows), the "open" caption, and the "new" mark on an entry. A zero count falls back to soft ink.

### Neutral

- **Sheet White** (#ffffff, dark #17191f): the working surface, dialogs, and the glyph colour on solid buttons.
- **Ink** (#141414, dark #f0f0f0): text, field lines, rules, solid buttons, check boxes, the undo bar background.
- **Soft Ink** (#5c5c5c, dark #a9adb8): placeholders, ticked entries, hints, private label tags, secondary icons.
- **Perforation Grey** (#8a8a8a, dark #7b7f8c): the dashed perforation, row dividers (the entry divider at 45% mix), the offline sheet edge, the install hint border.
- **Focus Blue** (#1d4ed8, dark #8fb4ff): the 4px focus outline. On the board and in the undo bar the outline is white.
- **Selection** (#233a8c, dark #3a58c4): text selection background with white text.

### Named Rules

**The One Red Rule.** Red marks only what is open now. Never a button, a label, a tag, or an error.

**The Ink Button Rule.** Primary actions are solid ink, not blue and not red. Blue belongs to the board and to label identity.

**The Shape Over Colour Rule.** Every state must also differ in form: strike-through plus position, dashed edge, hollow dot, knob position.

## Typography

**Count Font:** Archivo Variable at width 70% (Arial Narrow fallback), weight 900.
**Text Font:** Atkinson Hyperlegible Next Variable (system-ui fallback).

**Character:** a poster-narrow figure against a very open, unambiguous grotesque. The count is the only thing that shouts.

### Hierarchy

- **Count** (900, clamp(5rem, 28vw, 7rem), 0.8, -0.02em): the open number on the list sheet, right of the title; drops above the title when the head is narrower than 18rem.
- **Row count** (900, 3rem, 1): the open number on each list row.
- **Wordmark** (900, 1.75rem, +0.02em): the placeholder "Tomu" in the Logo component, replaceable in one place.
- **Title** (700, 2rem, 1.1): list and page headings; settings section headings are 1.35rem.
- **Row title** (700, 1.5rem, 1.15): list names in the overview; also dialog titles (1.5rem, 1.2) and empty-state sentences (1.5rem, 1.3).
- **Item** (400, 1.35rem, 1.25): entry text in the list. Add field text is 1.2rem.
- **Body** (400, 1rem, 1.4): hints, captions, tags, status badge.
- **Button** (700, 1.15rem to 1.25rem): back link, tear-off, undo bar, new-list button.
- **Label caps** (400 to 700, 1.125rem, +0.04em, uppercase): label names on the sheet and group headings in board text blue. This is the only uppercase in the system.

### Named Rules

**The Two Voices Rule.** The condensed face is for numbers and the wordmark. Never set sentences in it.

**The Large View Rule.** Sizes are rem so they follow the root: 112.5% (18px) by default, 150% (24px) with the large view. Do not use px for type or targets.

## Layout

One column. The blue board runs full width; the sheet is centred, at most 40rem wide, with 1.25rem inner padding and a 3px edge. The app bar content aligns to the sheet's inner edge (a minimum 1rem inset, at least 6.1rem tall). The sheet fills the remaining height, so blue shows above and beside it, never below.

Spacing is a rem rhythm built from 0.25, 0.5, 0.75, 1, 1.25 and 2rem steps. Rows are tall: 4rem per entry, 4.5rem per list. Every interactive target is at least 3rem (`--tap`); add field and add button are 3.75rem; text inputs are 3.5rem. Input and button share a row while the input keeps 14rem, otherwise the button drops below.

Fixed furniture on every list sheet: label capitals, then title left with open count right, then a 4px ink rule, then the add field, the open entries, the perforation, ticked entries, and the tear-off button. The undo bar is sticky at the bottom and never covers the last rows. Layout responds with container queries and wrapping, not device breakpoints; no media-width breakpoints exist.

## Elevation & Depth

Flat. Depth comes from the sheet lying on the board and from thick lines. The single exception is the dialog, which lies above the sheet with a 3px ink border, a backdrop of 50% black, and a soft shadow.

### Shadow Vocabulary

- **Dialog lift** (`box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 0.35)`): dialogs only.

### Named Rules

**The Flat Sheet Rule.** No shadow on anything that lies on the sheet. Only an object above the sheet (a dialog) gets one.

## Shapes

Small, firm corners (6px) on every field, box, button and tag, with the sheet rounded at the top corners only (6px 6px 0 0). The new mark uses 4px. The settings switch track is a full pill (1rem) with a round knob; status dots are circles. Lines are thick and square-ended: 3px borders, a 4px rule, 3px dashed perforation. The sheet itself is cut by the perforation, which spans the sheet width past the padding with its caption set into the line on the right.

## Components

### Buttons

- **Shape:** 6px radius, 3px ink border, minimum 3rem square, 1.25rem side padding, bold text.
- **Solid:** ink fill, sheet-colour text. Used for primary actions (new list, retry, confirm, add).
- **Ghost:** transparent, ink text, same border. Used for secondary and cancel.
- **Tear off:** full-width outlined button below the ticked entries (3.75rem high).
- **Add:** a 3.75rem ink square beside the add field, with a plus glyph in sheet colour.
- **Disabled:** 45% opacity, not-allowed cursor.
- **Focus:** 4px focus-blue outline with 2px offset (white on the board and in the undo bar).

### Fields

- **Style:** 3px ink border, 6px radius, transparent background, soft-ink placeholder. Text field 3.5rem high; the add field is a growing textarea (3.75rem to 10rem, 1.2rem text) so pasted lists fit.
- **Focus:** the global focus outline.

### Entry row (signature)

- 4rem tall, 2px perforation-grey divider at 45% mix. A 2.1rem box with a 3px ink border and 6px radius, then 1.35rem text; the whole row is the tap target, with a separate 3rem edit button in soft ink.
- **Ticked:** the box fills with ink and shows a sheet-colour check; text is soft ink, struck through with a 3px line; the row sits below the perforation.
- **New:** a 2px red outlined "new" mark, 4px radius, inline with the text so it wraps with the words.

### Open count and list row

- List row: 4.5rem minimum, 2px perforation-grey divider, title (1.5rem bold) with label tags under it, and the row count at right in red (soft ink at zero). The whole row is a link.

### Label tags

- **Private:** outlined 2px in soft ink, soft-ink bold text, 6px radius.
- **Shared:** filled board blue, white text. Never red.
- **Plain (on the sheet):** no box, uppercase capitals in board text blue.

### Navigation

- The app bar is the board: back link ("‹ All lists") at left, status and settings at right, white text on blue. Back link is bold 1.15rem with a 3rem target. Settings uses a 3px currentColor outline button.

### Status badge

- A dot and a word. Synced shows a solid dot; offline shows a hollow dot (2px ring). A screen-reader-only text mirrors it. When offline, the sheet edge turns dashed perforation grey.

### Undo bar

- Sticky bottom bar, ink background and sheet-colour text, 1.15rem bold, with a ghost-style button (3px sheet-colour border). Hidden when empty.

### Dialog

- Native dialog, 34rem max, 1.25rem padding, 3px ink border, sheet background, with a 3rem square close button and a 1.5rem title. Confirm dialogs right-align a ghost and a solid button.

### Settings switch

- A 3.25rem by 1.75rem pill track with 3px ink border and a 1rem knob. On: track fills ink, knob turns sheet colour and moves right.

### Install hint

- A 2px dashed perforation-grey top border, soft-ink text, a bordered install button and a close button, each at least 3rem.

### Motion

- **Tick:** entries reorder with a 250ms flip.
- **Tear off:** the ticked entries leave over 450ms with a cubic-in curve, sliding down 2.5rem and rotating 3 degrees from the top-left corner while fading. The sheet then closes up.
- **Reduced motion:** the flip and tear durations are zero and a global rule cuts any remaining animation and transition to 0.001ms. Nothing else moves.

## Do's and Don'ts

### Do:

- **Do** size type and targets in rem so the large view (150% root) scales everything; keep every target at least 3rem.
- **Do** use solid ink for primary buttons and 3px ink borders for ghosts, fields and boxes.
- **Do** reserve calendar red for the open count, its caption, and the "new" mark.
- **Do** show state by form (strike-through and position, dashed edge, hollow dot, knob position) as well as colour.
- **Do** keep label, title and count in the same places on every sheet, and set numbers in the condensed face.
- **Do** keep the 6px corner radius and 2 to 4px line weights.

### Don't:

- **Don't** use red for buttons, errors, tags or decoration.
- **Don't** put a shadow on anything that lies on the sheet; only dialogs lift.
- **Don't** set sentences or labels in the condensed count face.
- **Don't** use px for type sizes, which would ignore the large view.
- **Don't** shrink a tap target below 3rem or a divider below 2px.
- **Don't** add motion beyond the flip and the tear; honour reduced motion.

**Not canonized (defects the build carries):** label colours from the product brief are not rendered anywhere (tags use only the shared/private treatment), and the placeholder wordmark is not a final logo.
