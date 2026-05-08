---
name: slides-creation
description: Layout patterns for slides.createFromJson. Use when asked to build a presentation deck. Supports multiple themes — pick one before building. Use cloudstyle for Google Cloud / GCP presentations, dark for premium or thematic decks, minimal for clean general-purpose work.
metadata:
  version: 2.0.0
---

# slides-creation

Layout patterns for `slides.createFromJson`. **Choose a theme before building** — the theme determines your footer, color palette, and background style.

## Workflow

```
1. Choose a theme        → minimal | cloudstyle | dark | custom
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

**Vision model for conversion:** use `gemini-3.1-pro-preview` on the Vertex AI global endpoint for highest-fidelity translation. Standard API endpoint will timeout.

**Layer rule (critical):** every text element sharing a position with a shape MUST have `layer = shape layer + 1`. Text behind a shape is invisible — this is the most common failure mode.

---

## Themes

### `minimal` (default)
Clean, general-purpose. White background, dark text, one accent color, no corporate footer. Right for any audience where you're not representing a specific brand.

**No footer required.** Choose an accent color that fits the topic — don't default to blue.

**Suggested palettes by topic:**

| Topic feel | Primary bg | Accent | Body text |
|---|---|---|---|
| Tech / code | `#1E1E2E` (dark) | `#7C9CFF` (blue) | white |
| Nature / health | white | `#2C5F2D` (forest) | `#1a1a1a` |
| Energy / startup | white | `#F96167` (coral) | `#1a1a1a` |
| Premium / exec | `#1E2761` (navy) | `#CADCFC` (ice) | white |
| Calm / product | white | `#028090` (teal) | `#1a1a1a` |

### `cloudstyle`
Google Cloud brand. Use for GCP, Workspace, Vertex AI, or any Google Cloud presentation.

**Footer (include on EVERY slide):**
```json
{"type":"text","content":"Google Cloud","layer":2,"position":{"x":36,"y":375,"w":120,"h":20},"style":{"size":10,"color":"text_muted"}},
{"type":"text","content":"Proprietary & Confidential","layer":2,"position":{"x":502,"y":375,"w":200,"h":20},"style":{"size":10,"color":"text_muted","align":"END"}},
{"type":"shape","layer":0,"position":{"x":0,"y":397,"w":180,"h":8},"style":{"bg_color":"red","no_border":true}},
{"type":"shape","layer":0,"position":{"x":180,"y":397,"w":180,"h":8},"style":{"bg_color":"yellow","no_border":true}},
{"type":"shape","layer":0,"position":{"x":360,"y":397,"w":180,"h":8},"style":{"bg_color":"blue","no_border":true}},
{"type":"shape","layer":0,"position":{"x":540,"y":397,"w":180,"h":8},"style":{"bg_color":"green","no_border":true}}
```
Accent color: `"secondary"` (Google Blue `#1A73E8`). White backgrounds on content slides. See `n0012/ai-skills/slides-designer` for the full Cloudstyle pattern library.

### `dark`
Dark dominant background with light text and a punchy accent. Use for thematic decks, demos, product reveals, or when Cloudstyle would feel generic.

**Structure:** Dark background on title + closing slides, light on content ("sandwich"). Or commit to dark throughout.

**Footer (optional):** omit, or use a minimal single line in muted color.

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
