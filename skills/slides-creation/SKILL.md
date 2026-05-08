---
name: slides-creation
description: Layout patterns for slides.createFromJson. Use when asked to build a presentation deck. Default theme is google (4-color brand bar). Other themes — exec, pitch, technical, workshop, dark, demo, hcls, customer, simple, google-dark, google-minimal — are available for different audiences and contexts.
metadata:
  version: 3.0.0
---

# slides-creation

Layout patterns for `slides.createFromJson`. **Choose a theme before building.** Default: `google`. Ask the user if ambiguous.

## Theme Quick-Pick

| Theme | Default for |
|---|---|
| `google` | GCP, Workspace, Vertex AI, internal Google — 4-color brand bar |
| `google-dark` | Google Cloud with dark content slides |
| `google-minimal` | Google Cloud, light footer only, no "Proprietary & Confidential" |
| `exec` | Board, QBR, EBC — one idea per slide, very sparse |
| `pitch` | Investor, launch, proposal — bold and dramatic |
| `technical` | Developer, architecture, deep-dive — code-block heavy |
| `workshop` | Training, enablement — warm, large readable type |
| `dark` | Thematic, product reveal, personal project |
| `demo` | Live demo, product walkthrough — dark throughout |
| `hcls` | Healthcare / life sciences — clinical, conservative |
| `customer` | External non-Google customer-facing — neutral, their accent |
| `simple` | General purpose, no brand, white background |

## Workflow

```
1. Choose a theme        → see Theme Quick-Pick above (default: google)
2. slides.create         → get presentationId
3. slides.createFromJson → build all slides (focus on layout)
4. slides.updateSpeakerNotes × N → write talk track
5. QA: thumbnail each slide → fix issues → re-verify
6. Return the URL
```

Write ~45 seconds of spoken content per slide (4-6 sentences): opening line, key points, transition.

---

### Image-first (concept → JSON)

Use when you want to visually ideate before committing to JSON. `gemini-3.1-flash-image-preview` sketches the concept; you then read it multimodally and translate to `slides.createFromJson` elements.

```
1. Generate concept image   → gemini-3.1-flash-image-preview (Nano)
2. Analyze the image        → describe layout, hierarchy, color intent
3. Map to JSON elements     → translate regions to text/shape/image
4. slides.create + createFromJson
5. slides.getSlideThumbnail → compare concept vs render → correct
6. Return the URL
```

**Image generation model:** `gemini-3.1-flash-image-preview` (Nano Banana 2) on Vertex AI global endpoint. Supports 16:9 native aspect ratio, image editing (pass an existing image to refine it), and up to 14 images per prompt. Use temperature 0.8 for consistent style across slides.

**Vision model for conversion:** `gemini-3.1-pro-preview` on the Vertex AI global endpoint. Standard `generativelanguage.googleapis.com` endpoint will timeout on large JSON responses.

**Vertex AI global endpoint pattern:**
```
https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/publishers/google/models/{MODEL}:generateContent
```
Auth: `Authorization: Bearer $(gcloud auth print-access-token)`

**Interleaved concept + JSON deck pattern:**
Create slides in ordinal pairs — concept image slide immediately followed by its JSON slide. Add each pair sequentially so the deck order is preserved: (concept₁, JSON₁, concept₂, JSON₂, ...). Never add all concept images at the end — they must be inserted BEFORE their corresponding JSON slide. Use one `slides.createFromJson` call per slide to keep payloads small and avoid CLI timeouts.

**Layer rule (critical):** every text element sharing a position with a shape MUST have `layer = shape layer + 1`. Text behind a shape is invisible — this is the most common failure mode.

---

## Themes

### `google` ★ default
Google Cloud brand. 4-color brand bar on every slide. White content backgrounds, Google Blue accent.

**Footer (every slide):**
```json
{"type":"text","content":"Google Cloud","layer":2,"position":{"x":36,"y":375,"w":120,"h":20},"style":{"size":10,"color":"text_muted"}},
{"type":"text","content":"Proprietary & Confidential","layer":2,"position":{"x":502,"y":375,"w":200,"h":20},"style":{"size":10,"color":"text_muted","align":"END"}},
{"type":"shape","layer":0,"position":{"x":0,"y":397,"w":180,"h":8},"style":{"bg_color":"red","no_border":true}},
{"type":"shape","layer":0,"position":{"x":180,"y":397,"w":180,"h":8},"style":{"bg_color":"yellow","no_border":true}},
{"type":"shape","layer":0,"position":{"x":360,"y":397,"w":180,"h":8},"style":{"bg_color":"blue","no_border":true}},
{"type":"shape","layer":0,"position":{"x":540,"y":397,"w":180,"h":8},"style":{"bg_color":"green","no_border":true}}
```
Accent: `"secondary"` (Google Blue). See `n0012/ai-skills/slides-designer` for full Cloudstyle pattern library.

### `google-dark`
Google brand bar kept. Dark (`"primary"`) backgrounds on title + section divider slides, white on content. White text on dark slides.

### `google-minimal`
Brand bar only — no "Proprietary & Confidential" text. Use for lighter external sharing where the full confidential footer feels heavy.

---

### `exec`
One key message per slide. Maximum whitespace. For board, QBR, EBC.

- Backgrounds: dark navy (`#1E2761`) title + closing, white content
- Accent: ice blue (`#CADCFC`) for labels only
- Title: 40pt bold. Body: 18pt max. One stat or one statement per slide.
- No footer. No brand bar. Dates/version as small muted text bottom-right if needed.

### `pitch`
Bold and dramatic. For investor decks, product launches, proposals.

- "Sandwich": dark title slide, white content, dark closing
- Title slide: full-bleed dark bg, large white title (44pt+), punchy subtitle in accent color
- Accent: choose one strong color (coral, electric blue, or green) — commit to it throughout
- Stats as large callouts (72pt numbers with small labels)
- No corporate footer

### `technical`
Developer, architecture, deep-dive. Dense but structured.

- White backgrounds throughout
- Monospace/code blocks prominent — dark bg (`"primary"`) with `"primary_text"`, size 11pt
- Section headings in accent, body 14pt, code 11pt
- Thin vertical/horizontal dividers for structure
- Optional minimal footer: slide number bottom-right only

### `workshop`
Training, enablement, how-to. Easy to read from the back of a room.

- Warm off-white backgrounds (`#FFFDF7`)
- Large body text: 18pt minimum
- Section headers: 24pt bold in a warm accent (teal or terracotta)
- Numbered steps as large bold callouts
- No corporate footer

---

### `dark`
Thematic, personal projects, creative decks. Not for Google Cloud work.

- Dark charcoal (`#1E1E2E`) throughout, or sandwich (dark title + white content)
- Accent: electric blue, coral, or mint — pick one to match topic
- White text on dark, dark text on white
- No footer

### `demo`
Live demo or product walkthrough. Screenshot-friendly, stays out of the way.

- Dark background throughout (don't switch to white mid-deck — screenshots look bad on white)
- Accent: one bright color for UI callouts
- Minimal text — slides support the demo, they're not the content
- No footer

---

### `hcls`
Healthcare / life sciences customer-facing. Clinical, conservative, trust-building.

- White backgrounds, conservative spacing
- Accent: deep teal (`#028090`) or navy (`#1C3557`)
- No bold color blocks — use thin accent lines and muted section labels
- Footer: company name + date, no "Proprietary & Confidential" (too aggressive for clinical context)

### `customer`
External customer-facing, non-Google brand. Neutral and professional.

- White background, dark text
- Accent: ask the user for their brand color, or use a neutral teal/navy
- No Google branding. Optional minimal footer with just the date or meeting title.

### `simple`
General purpose. White background, one accent, no brand. Use when nothing else fits.

- White backgrounds throughout
- Choose accent color that fits the topic — don't default to blue
- No footer required

**Suggested palettes:**
| Topic | Accent |
|---|---|
| Tech | `#4F8EF7` electric blue |
| Nature / health | `#2C5F2D` forest green |
| Energy / startup | `#F96167` coral |
| Calm / product | `#028090` teal |

---

## Design Principles

These apply regardless of theme. Adapted from production-grade presentation guidelines.

### Before building

**Pick a palette for THIS topic.** If swapping your colors into a completely different presentation would still "work," your choices aren't specific enough.

**Dominance over equality.** One color carries 60–70% of visual weight. One or two supporting tones. One sharp accent. Never equal weight across all colors.

**Every slide needs a visual element** — image, large number, icon, or shape. Text-only slides are forgettable.

**Vary layouts.** Don't use the same two-column pattern on every slide. Mix: stat callout, half-bleed, three-column, full-bleed quote, content + image.

### Typography

| Element | Size | Weight |
|---|---|---|
| Slide title | 36–40pt | bold |
| Section heading | 20–24pt | bold |
| Body / bullets | 14–16pt | regular |
| Captions / labels | 10–12pt | regular |

These are minimums. Go larger when whitespace allows.

**Size text boxes generously:** `h ≈ (lines × font_size × 1.6) + 16`. Text that overflows is silently clipped.

### Spacing

- Minimum 36pt margin from slide edges (x:36 on content)
- 0.3–0.5" between content blocks
- Leave breathing room — don't fill every inch

### What NOT to do

- **Never add a separator line under the title** — this is a hallmark of AI-generated slides. Use whitespace instead.
- **Never repeat the same layout** across more than 2 consecutive slides
- **Never center body text** — left-align paragraphs and lists; center only titles on title slides
- **Never default to blue** unless the brand requires it — choose colors that reflect the specific topic
- **Never use text size contrast below 1.5×** between title and body — they need to feel clearly different
- **Never use inconsistent spacing** — pick 0.3" or 0.5" gaps and use throughout
- **Never put text-only slides in a deck that has visual slides** — add a shape callout, a large number, or an image
- **Never use low-contrast elements** — icons AND text need strong contrast against their background
- **Never forget speaker_notes** — a deck without notes is incomplete

---

## Color aliases

Use aliases instead of hardcoded RGB. The theme system resolves these at render time.

`primary` · `primary_text` · `secondary` · `secondary_text` · `text` · `text_muted` · `surface` · `surface_alt` · `background` · `blue` · `red` · `yellow` · `green`

---

## Pattern 1: Title Slide (light)

```json
{
  "speaker_notes": "Welcome everyone...",
  "elements": [
    {"type":"text","content":"Presentation Title","layer":1,
     "position":{"x":36,"y":100,"w":580,"h":100},
     "style":{"size":40,"bold":true,"color":"text"}},
    {"type":"text","content":"Subtitle — one line of context","layer":1,
     "position":{"x":36,"y":210,"w":500,"h":36},
     "style":{"size":18,"color":"secondary"}}
  ]
}
```

## Pattern 2: Title Slide (dark background)

```json
{
  "speaker_notes": "Welcome everyone...",
  "elements": [
    {"type":"shape","layer":0,"position":{"x":0,"y":0,"w":720,"h":405},
     "style":{"bg_color":"primary","no_border":true}},
    {"type":"text","content":"Presentation Title","layer":2,
     "position":{"x":48,"y":100,"w":580,"h":100},
     "style":{"size":40,"bold":true,"color":"primary_text"}},
    {"type":"text","content":"Subtitle — one line of context","layer":2,
     "position":{"x":48,"y":210,"w":500,"h":36},
     "style":{"size":18,"color":"secondary"}}
  ]
}
```

## Pattern 3: Stat Callout

For slides built around a single number or key fact. Effective for metrics, counts, or surprising data points.

```json
{
  "speaker_notes": "The key number here is...",
  "elements": [
    {"type":"text","content":"Slide Title","layer":1,
     "position":{"x":36,"y":24,"w":648,"h":44},
     "style":{"size":22,"bold":true,"color":"text"}},
    {"type":"text","content":"17","layer":1,
     "position":{"x":36,"y":100,"w":300,"h":140},
     "style":{"size":96,"bold":true,"color":"secondary"}},
    {"type":"text","content":"patterns in the move vocabulary","layer":1,
     "position":{"x":36,"y":248,"w":300,"h":40},
     "style":{"size":16,"color":"text_muted"}},
    {"type":"text","content":"Supporting detail or explanation on the right side of the slide.","layer":1,
     "position":{"x":380,"y":100,"w":300,"h":160},
     "style":{"size":15,"color":"text"}}
  ]
}
```

## Pattern 4: Content Slide

```json
{
  "speaker_notes": "This slide covers...",
  "elements": [
    {"type":"text","content":"Slide Title","layer":1,
     "position":{"x":36,"y":24,"w":648,"h":50},
     "style":{"size":36,"bold":true,"color":"text"}},
    {"type":"text","content":"SECTION LABEL","layer":1,
     "position":{"x":36,"y":96,"w":300,"h":24},
     "style":{"size":12,"bold":true,"color":"secondary"}},
    {"type":"text","content":"Body text goes here.\n\nSecond paragraph with supporting detail.","layer":1,
     "position":{"x":36,"y":124,"w":648,"h":180},
     "style":{"size":15,"color":"text"}}
  ]
}
```

## Pattern 5: Two-Column

```json
{
  "speaker_notes": "On the left... on the right...",
  "elements": [
    {"type":"text","content":"Comparison Title","layer":1,
     "position":{"x":36,"y":24,"w":648,"h":50},
     "style":{"size":36,"bold":true,"color":"text"}},
    {"type":"text","content":"Left Heading","layer":1,
     "position":{"x":36,"y":96,"w":310,"h":30},
     "style":{"size":18,"bold":true,"color":"secondary"}},
    {"type":"text","content":"• Point one\n• Point two\n• Point three","layer":1,
     "position":{"x":36,"y":132,"w":310,"h":160},
     "style":{"size":14,"color":"text"}},
    {"type":"shape","layer":0,"position":{"x":364,"y":90,"w":1,"h":240},
     "style":{"bg_color":"text_muted","no_border":true}},
    {"type":"text","content":"Right Heading","layer":1,
     "position":{"x":380,"y":96,"w":310,"h":30},
     "style":{"size":18,"bold":true,"color":"secondary"}},
    {"type":"text","content":"• Point one\n• Point two\n• Point three","layer":1,
     "position":{"x":380,"y":132,"w":310,"h":160},
     "style":{"size":14,"color":"text"}}
  ]
}
```

## Pattern 6: Three-Column

```json
{
  "speaker_notes": "Three key capabilities...",
  "elements": [
    {"type":"text","content":"Three Key Points","layer":1,
     "position":{"x":36,"y":24,"w":648,"h":50},
     "style":{"size":36,"bold":true,"color":"text"}},
    {"type":"text","content":"First","layer":1,
     "position":{"x":36,"y":96,"w":190,"h":28},
     "style":{"size":18,"bold":true,"color":"secondary"}},
    {"type":"text","content":"Description of the first point.","layer":1,
     "position":{"x":36,"y":130,"w":190,"h":160},
     "style":{"size":13,"color":"text"}},
    {"type":"shape","layer":0,"position":{"x":238,"y":90,"w":1,"h":220},
     "style":{"bg_color":"text_muted","no_border":true}},
    {"type":"text","content":"Second","layer":1,
     "position":{"x":254,"y":96,"w":190,"h":28},
     "style":{"size":18,"bold":true,"color":"secondary"}},
    {"type":"text","content":"Description of the second point.","layer":1,
     "position":{"x":254,"y":130,"w":190,"h":160},
     "style":{"size":13,"color":"text"}},
    {"type":"shape","layer":0,"position":{"x":456,"y":90,"w":1,"h":220},
     "style":{"bg_color":"text_muted","no_border":true}},
    {"type":"text","content":"Third","layer":1,
     "position":{"x":472,"y":96,"w":190,"h":28},
     "style":{"size":18,"bold":true,"color":"secondary"}},
    {"type":"text","content":"Description of the third point.","layer":1,
     "position":{"x":472,"y":130,"w":190,"h":160},
     "style":{"size":13,"color":"text"}}
  ]
}
```

---

## QA (Required)

**Assume there are problems. Your job is to find them.** Your first render is almost never correct.

After building, use `slides.getSlideThumbnail` on each slide and inspect visually. Look for:

- Overlapping elements — text through shapes, stacked elements
- Text overflow or cut off at box boundaries
- Elements too close to slide edges (< 36pt margin)
- Uneven gaps — cramped in one area, large empty space in another
- Columns or similar elements not aligned consistently
- Low-contrast text (light text on light background, or vice versa)
- Text boxes too narrow causing excessive wrapping
- Same layout repeated more than twice in a row
- Missing speaker notes

**Fix issues, then re-verify affected slides.** One fix often creates another problem. Do not declare success until you've completed at least one fix-and-verify cycle.
