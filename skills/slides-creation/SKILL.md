---
name: slides-creation
description: Layout patterns for slides.createFromJson. Customize this skill with your organization's brand colors, footer text, and design patterns. Use when asked to build a presentation deck.
metadata:
  version: 1.0.0
---

# slides-creation

Layout patterns for `slides.createFromJson`. **Customize the brand section below for your organization.**

## Workflow

```
1. slides.create            → get presentationId
2. slides.createFromJson    → build all slides (focus on layout)
3. slides.updateSpeakerNotes × N → write talk track for each slide
4. Return the URL
```

Write ~45 seconds of spoken content per slide (4-6 sentences): opening line, key points, transition.

---

## YOUR BRAND — customize this section

Replace the values below with your organization's brand:

**Footer left:** `YOUR COMPANY`
**Footer right:** `Confidential`
**Brand colors (for accent bar at bottom):**
- Color 1: `{"red": 0.2, "green": 0.4, "blue": 0.8}` ← your primary
- Color 2: `{"red": 0.8, "green": 0.2, "blue": 0.2}` ← your secondary
- Color 3: `{"red": 0.9, "green": 0.7, "blue": 0.1}` ← your tertiary
- Color 4: `{"red": 0.2, "green": 0.6, "blue": 0.3}` ← your quaternary

**Font:** Arial (or your brand font if available in Google Slides)

---

## Standard footer (include on EVERY slide)

```json
{"type":"text","content":"YOUR COMPANY","layer":1,"position":{"x":36,"y":375,"w":120,"h":20},"style":{"size":10,"color":"text_muted"}},
{"type":"text","content":"Confidential","layer":1,"position":{"x":502,"y":375,"w":200,"h":20},"style":{"size":10,"color":"text_muted","align":"END"}},
{"type":"shape","position":{"x":0,"y":397,"w":180,"h":8},"layer":0,"style":{"bg_color":"blue","no_border":true}},
{"type":"shape","position":{"x":180,"y":397,"w":180,"h":8},"layer":0,"style":{"bg_color":"red","no_border":true}},
{"type":"shape","position":{"x":360,"y":397,"w":180,"h":8},"layer":0,"style":{"bg_color":"yellow","no_border":true}},
{"type":"shape","position":{"x":540,"y":397,"w":180,"h":8},"layer":0,"style":{"bg_color":"green","no_border":true}}
```

Add these elements to every slide. The patterns below omit them for brevity.

---

## Design philosophy

**White is the dominant color.** Content slides are white backgrounds with near-black text. No colored header bars. No tinted card boxes.

**Color is rare and purposeful.** Use one accent color (typically `"secondary"`) for section headings and labels. The brand bar at the bottom is the only place multiple colors appear together.

**No header bars on content slides.** Titles are large bold text placed at the top-left on white.

**Thin lines, not boxes.** Use 1pt gray separator lines for structure, not background-filled rectangles.

**Less is more.** If a title and three bullets on white communicates clearly, that IS the design.

---

## Color aliases

Use aliases instead of hardcoded RGB:

`primary` · `primary_text` · `secondary` · `secondary_text` · `text` · `text_muted` · `surface` · `surface_alt` · `background` · `blue` · `red` · `yellow` · `green`

---

## Pattern 1: Title Slide

```json
{
  "speaker_notes": "Welcome everyone...",
  "elements": [
    {"type": "text", "content": "Presentation Title", "layer": 1,
     "position": {"x": 36, "y": 80, "w": 450, "h": 200},
     "style": {"size": 36, "bold": true, "color": "text"}},
    {"type": "text", "content": "Subtitle goes here", "layer": 1,
     "position": {"x": 36, "y": 290, "w": 450, "h": 30},
     "style": {"size": 16, "color": "secondary"}}
  ]
}
```

## Pattern 2: Section Divider

```json
{
  "speaker_notes": "Let's move to the next section...",
  "elements": [
    {"type": "shape", "position": {"x": 36, "y": 100, "w": 6, "h": 120}, "layer": 0,
     "style": {"bg_color": "secondary", "no_border": true}},
    {"type": "text", "content": "Section Title", "layer": 1,
     "position": {"x": 56, "y": 100, "w": 500, "h": 120},
     "style": {"size": 36, "bold": true, "color": "text", "vertical_align": "MIDDLE"}}
  ]
}
```

## Pattern 3: Content Slide

```json
{
  "speaker_notes": "This slide covers...",
  "elements": [
    {"type": "text", "content": "Slide Title", "layer": 1,
     "position": {"x": 36, "y": 30, "w": 650, "h": 40},
     "style": {"size": 24, "bold": true, "color": "text"}},
    {"type": "shape", "position": {"x": 36, "y": 85, "w": 650, "h": 1}, "layer": 0,
     "style": {"bg_color": "text_muted", "no_border": true}},
    {"type": "text", "content": "SECTION LABEL", "layer": 1,
     "position": {"x": 36, "y": 90, "w": 300, "h": 20},
     "style": {"size": 11, "bold": true, "color": "secondary"}},
    {"type": "text", "content": "Body text goes here.", "layer": 1,
     "position": {"x": 36, "y": 115, "w": 650, "h": 200},
     "style": {"size": 14, "color": "text"}}
  ]
}
```

## Pattern 4: Two-Column

```json
{
  "speaker_notes": "On the left... on the right...",
  "elements": [
    {"type": "text", "content": "Comparison", "layer": 1,
     "position": {"x": 36, "y": 30, "w": 650, "h": 40},
     "style": {"size": 24, "bold": true, "color": "text"}},
    {"type": "text", "content": "Left Heading", "layer": 1,
     "position": {"x": 36, "y": 90, "w": 310, "h": 24},
     "style": {"size": 14, "bold": true, "color": "secondary"}},
    {"type": "text", "content": "• Point one\n• Point two\n• Point three", "layer": 1,
     "position": {"x": 36, "y": 120, "w": 310, "h": 200},
     "style": {"size": 12, "color": "text"}},
    {"type": "shape", "position": {"x": 358, "y": 85, "w": 1, "h": 260}, "layer": 0,
     "style": {"bg_color": "text_muted", "no_border": true}},
    {"type": "text", "content": "Right Heading", "layer": 1,
     "position": {"x": 380, "y": 90, "w": 310, "h": 24},
     "style": {"size": 14, "bold": true, "color": "secondary"}},
    {"type": "text", "content": "• Point one\n• Point two\n• Point three", "layer": 1,
     "position": {"x": 380, "y": 120, "w": 310, "h": 200},
     "style": {"size": 12, "color": "text"}}
  ]
}
```

## Pattern 5: Three-Column

```json
{
  "speaker_notes": "Three key points...",
  "elements": [
    {"type": "text", "content": "Three Key Points", "layer": 1,
     "position": {"x": 36, "y": 30, "w": 650, "h": 40},
     "style": {"size": 24, "bold": true, "color": "text"}},
    {"type": "text", "content": "First", "layer": 1,
     "position": {"x": 36, "y": 90, "w": 200, "h": 22},
     "style": {"size": 16, "bold": true, "color": "secondary"}},
    {"type": "text", "content": "Description of the first point.", "layer": 1,
     "position": {"x": 36, "y": 118, "w": 200, "h": 200},
     "style": {"size": 12, "color": "text"}},
    {"type": "shape", "position": {"x": 250, "y": 85, "w": 1, "h": 260}, "layer": 0,
     "style": {"bg_color": "text_muted", "no_border": true}},
    {"type": "text", "content": "Second", "layer": 1,
     "position": {"x": 266, "y": 90, "w": 200, "h": 22},
     "style": {"size": 16, "bold": true, "color": "secondary"}},
    {"type": "text", "content": "Description of the second point.", "layer": 1,
     "position": {"x": 266, "y": 118, "w": 200, "h": 200},
     "style": {"size": 12, "color": "text"}},
    {"type": "shape", "position": {"x": 480, "y": 85, "w": 1, "h": 260}, "layer": 0,
     "style": {"bg_color": "text_muted", "no_border": true}},
    {"type": "text", "content": "Third", "layer": 1,
     "position": {"x": 496, "y": 90, "w": 200, "h": 22},
     "style": {"size": 16, "bold": true, "color": "secondary"}},
    {"type": "text", "content": "Description of the third point.", "layer": 1,
     "position": {"x": 496, "y": 118, "w": 200, "h": 200},
     "style": {"size": 12, "color": "text"}}
  ]
}
```

---

## Tips

- **Size boxes to content.** `h ≈ (lines × font_size × 1.5) + 20`. Never h=300 for 3 lines.
- **Batch all slides in one call.** Use `{"slides":[...]}` format.
- **Thin lines as structure.** 1pt rectangles (h=1 or w=1) instead of background-filled boxes.
- **One accent color on content slides.** Use `"secondary"` for labels and headings.

## What NOT to do

- Don't put colored rectangles behind slide titles.
- Don't use full-bleed solid color backgrounds.
- Don't use multiple accent colors on a single content slide.
- Don't forget the footer and brand bar on every slide.
- Don't skip speaker_notes.
