/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, slides_v1 } from 'googleapis';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { request } from 'gaxios';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { extractDocId } from '../utils/IdUtils';
import { gaxiosOptions } from '../utils/GaxiosConfig';

// === Theme system ===

type RGB = { red: number; green: number; blue: number };
type ColorValue = RGB | string;

interface Theme {
  primary: RGB;       // Header / primary accent background
  primaryText: RGB;   // Text on primary background
  secondary: RGB;     // Secondary accent
  secondaryText: RGB; // Text on secondary background
  surface: RGB;       // Card / box background (primary tint)
  surfaceAlt: RGB;    // Card / box background (secondary tint)
  text: RGB;          // Default body text
  textMuted: RGB;     // Muted / caption text
  background: RGB;    // Slide background
  fontFamily: string; // Default font family
  // Extended palette — optional, used when alias is referenced
  accent1?: RGB;
  accent2?: RGB;
  accent3?: RGB;
  accent4?: RGB;
}

const THEMES: Record<string, Theme> = {
  // Clean neutral default — works without Google-specific fonts.
  // primary = near-black (#202124), secondary = Google Blue 600 (#1A73E8)
  light: {
    primary:       { red: 0.125, green: 0.129, blue: 0.141 }, // #202124
    primaryText:   { red: 1.000, green: 1.000, blue: 1.000 },
    secondary:     { red: 0.102, green: 0.451, blue: 0.910 }, // #1A73E8 Google Blue 600
    secondaryText: { red: 1.000, green: 1.000, blue: 1.000 },
    surface:       { red: 0.973, green: 0.976, blue: 0.980 }, // #F8F9FA Google Grey 50
    surfaceAlt:    { red: 0.914, green: 0.933, blue: 0.965 }, // #E9EEF6
    text:          { red: 0.125, green: 0.129, blue: 0.141 }, // #202124
    textMuted:     { red: 0.373, green: 0.388, blue: 0.408 }, // #5F6368 Google Grey 700
    background:    { red: 1.000, green: 1.000, blue: 1.000 },
    fontFamily:    'Arial',
    accent1:       { red: 0.102, green: 0.451, blue: 0.910 }, // #1A73E8 Blue
    accent2:       { red: 0.851, green: 0.188, blue: 0.145 }, // #D93025 Red 600
    accent3:       { red: 0.949, green: 0.600, blue: 0.000 }, // #F29900 Amber
    accent4:       { red: 0.094, green: 0.502, blue: 0.220 }, // #188038 Green 700
  },
  // Google brand palette — all four brand colors + neutral headers.
  // Headers use near-black #202124, brand colors are accents.
  google: {
    primary:       { red: 0.125, green: 0.129, blue: 0.141 }, // #202124 near-black (headers)
    primaryText:   { red: 1.000, green: 1.000, blue: 1.000 },
    secondary:     { red: 0.102, green: 0.451, blue: 0.910 }, // #1A73E8 Google Blue 600 (accent)
    secondaryText: { red: 1.000, green: 1.000, blue: 1.000 },
    surface:       { red: 0.910, green: 0.941, blue: 0.996 }, // #E8F0FE Blue 50
    surfaceAlt:    { red: 0.902, green: 0.957, blue: 0.918 }, // #E6F4EA Green 50
    text:          { red: 0.122, green: 0.122, blue: 0.122 }, // #1F1F1F
    textMuted:     { red: 0.267, green: 0.278, blue: 0.275 }, // #444746
    background:    { red: 1.000, green: 1.000, blue: 1.000 },
    fontFamily:    'Google Sans',
    accent1:       { red: 0.263, green: 0.522, blue: 0.957 }, // #4285F4 Google Blue
    accent2:       { red: 0.918, green: 0.263, blue: 0.208 }, // #EA4335 Google Red
    accent3:       { red: 0.984, green: 0.737, blue: 0.020 }, // #FBBC05 Google Yellow
    accent4:       { red: 0.204, green: 0.659, blue: 0.325 }, // #34A853 Google Green
  },
  // Dark theme — light accents on dark surfaces.
  // Uses Material Design 300-weight colors (light enough for dark bg).
  dark: {
    primary:       { red: 0.541, green: 0.706, blue: 0.973 }, // #8AB4F8 Blue 300 (headers)
    primaryText:   { red: 0.071, green: 0.071, blue: 0.098 }, // #121219 dark text on blue
    secondary:     { red: 0.506, green: 0.788, blue: 0.584 }, // #81C995 Green 300
    secondaryText: { red: 0.071, green: 0.071, blue: 0.098 },
    surface:       { red: 0.118, green: 0.118, blue: 0.157 }, // #1E1E28
    surfaceAlt:    { red: 0.176, green: 0.176, blue: 0.220 }, // #2D2D38
    text:          { red: 0.898, green: 0.898, blue: 0.898 }, // #E5E5E5
    textMuted:     { red: 0.553, green: 0.557, blue: 0.588 }, // #8D8E96
    background:    { red: 0.071, green: 0.071, blue: 0.098 }, // #121219
    fontFamily:    'Arial',
    accent1:       { red: 0.541, green: 0.706, blue: 0.973 }, // #8AB4F8 Blue 300
    accent2:       { red: 0.949, green: 0.545, blue: 0.510 }, // #F28B82 Red 300
    accent3:       { red: 0.992, green: 0.839, blue: 0.388 }, // #FDD663 Yellow 300
    accent4:       { red: 0.506, green: 0.788, blue: 0.584 }, // #81C995 Green 300
  },
};

const COLOR_ALIASES: Record<string, keyof Theme> = {
  primary:        'primary',
  primary_text:   'primaryText',
  secondary:      'secondary',
  secondary_text: 'secondaryText',
  surface:        'surface',
  surface_alt:    'surfaceAlt',
  text:           'text',
  text_muted:     'textMuted',
  background:     'background',
  accent1:        'accent1',
  accent2:        'accent2',
  accent3:        'accent3',
  accent4:        'accent4',
  // Semantic aliases for Google theme
  blue:           'accent1',
  red:            'accent2',
  yellow:         'accent3',
  green:          'accent4',
};

/**
 * Resolve a color value: pass-through RGB objects, resolve string aliases via theme.
 * Returns undefined if alias unknown or no theme active.
 */
function resolveColor(color: ColorValue | undefined, theme: Theme): RGB | undefined {
  if (!color) return undefined;
  if (typeof color !== 'string') return color as RGB;
  const key = COLOR_ALIASES[color.toLowerCase()];
  return key ? (theme[key] as RGB) : undefined;
}

export class SlidesService {
  constructor(private authManager: AuthManager) {}

  private async getSlidesClient(): Promise<slides_v1.Slides> {
    const auth = await this.authManager.getAuthenticatedClient();
    const options = { ...gaxiosOptions, auth };
    return google.slides({ version: 'v1', ...options });
  }

  public getText = async ({ presentationId }: { presentationId: string }) => {
    logToFile(
      `[SlidesService] Starting getText for presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;

      const slides = await this.getSlidesClient();
      // Get the presentation with all necessary fields
      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'title,slides(pageElements(shape(text,shapeProperties),table(tableRows(tableCells(text)))))',
      });

      let content = '';

      // Add presentation title
      if (presentation.data.title) {
        content += `Presentation Title: ${presentation.data.title}\n\n`;
      }

      // Process each slide
      if (presentation.data.slides) {
        presentation.data.slides.forEach((slide, slideIndex) => {
          content += `\n--- Slide ${slideIndex + 1} ---\n`;

          if (slide.pageElements) {
            slide.pageElements.forEach((element) => {
              // Extract text from shapes
              if (element.shape && element.shape.text) {
                const shapeText = this.extractTextFromTextContent(
                  element.shape.text,
                );
                if (shapeText) {
                  content += shapeText + '\n';
                }
              }

              // Extract text from tables
              if (element.table && element.table.tableRows) {
                content += '\n--- Table Data ---\n';
                element.table.tableRows.forEach((row) => {
                  const rowText: string[] = [];
                  if (row.tableCells) {
                    row.tableCells.forEach((cell) => {
                      const cellText = cell.text
                        ? this.extractTextFromTextContent(cell.text)
                        : '';
                      rowText.push(cellText.trim());
                    });
                  }
                  content += rowText.join(' | ') + '\n';
                });
                content += '--- End Table Data ---\n';
              }
            });
          }
          content += '\n';
        });
      }

      logToFile(`[SlidesService] Finished getText for presentation: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: content.trim(),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[SlidesService] Error during slides.getText: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  private extractTextFromTextContent(
    textContent: slides_v1.Schema$TextContent,
  ): string {
    let text = '';
    if (textContent.textElements) {
      textContent.textElements.forEach((element) => {
        if (element.textRun && element.textRun.content) {
          text += element.textRun.content;
        } else if (element.paragraphMarker) {
          // Add newline for paragraph markers
          text += '\n';
        }
      });
    }
    return text;
  }

  public getMetadata = async ({
    presentationId,
  }: {
    presentationId: string;
  }) => {
    logToFile(
      `[SlidesService] Starting getMetadata for presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;

      const slides = await this.getSlidesClient();
      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'presentationId,title,slides(objectId),pageSize,notesMaster,masters,layouts',
      });

      const metadata = {
        presentationId: presentation.data.presentationId,
        title: presentation.data.title,
        slideCount: presentation.data.slides?.length || 0,
        slides:
          presentation.data.slides?.map(({ objectId }) => ({ objectId })) ?? [],
        pageSize: presentation.data.pageSize,
        hasMasters: !!presentation.data.masters?.length,
        hasLayouts: !!presentation.data.layouts?.length,
        hasNotesMaster: !!presentation.data.notesMaster,
      };

      logToFile(`[SlidesService] Finished getMetadata for presentation: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(metadata),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SlidesService] Error during slides.getMetadata: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  private async downloadToLocal(url: string, localPath: string) {
    logToFile(`[SlidesService] Downloading from ${url} to ${localPath}`);
    if (!path.isAbsolute(localPath)) {
      throw new Error('localPath must be an absolute path.');
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(localPath), { recursive: true });

    const response = await request({
      url,
      responseType: 'arraybuffer',
      ...gaxiosOptions,
    });

    await fs.writeFile(localPath, Buffer.from(response.data as ArrayBuffer));
    logToFile(`[SlidesService] Downloaded successfully to ${localPath}`);
    return localPath;
  }

  public getImages = async ({
    presentationId,
    localPath,
  }: {
    presentationId: string;
    localPath: string;
  }) => {
    logToFile(
      `[SlidesService] Starting getImages for presentation: ${presentationId} (localPath: ${localPath})`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();
      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'slides(objectId,pageElements(objectId,title,description,image(contentUrl,sourceUrl)))',
      });

      const images = await Promise.all(
        (presentation.data.slides ?? []).flatMap((slide, index) =>
          (slide.pageElements ?? [])
            .filter((element) => element.image)
            .map(async (element) => {
              const imageData: any = {
                slideIndex: index + 1,
                slideObjectId: slide.objectId,
                elementObjectId: element.objectId,
                title: element.title,
                description: element.description,
                contentUrl: element.image?.contentUrl,
                sourceUrl: element.image?.sourceUrl,
              };

              if (imageData.contentUrl) {
                const filename = `slide_${imageData.slideIndex}_${element.objectId}.png`;
                const fullPath = path.join(localPath, filename);
                try {
                  await this.downloadToLocal(imageData.contentUrl, fullPath);
                  imageData.localPath = fullPath;
                } catch (downloadError) {
                  logToFile(
                    `[SlidesService] Failed to download image ${element.objectId}: ${downloadError}`,
                  );
                  imageData.downloadError = String(downloadError);
                }
              }

              return imageData;
            }),
        ),
      );

      logToFile(`[SlidesService] Finished getImages for presentation: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ images }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SlidesService] Error during slides.getImages: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  public create = async ({ title }: { title: string }) => {
    logToFile(`[SlidesService] Creating new presentation: ${title}`);
    try {
      const slides = await this.getSlidesClient();
      const response = await slides.presentations.create({
        requestBody: { title },
      });

      const presId = response.data.presentationId!;
      logToFile(
        `[SlidesService] Created presentation: ${presId}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              presentationId: presId,
              title: response.data.title,
              url: `https://docs.google.com/presentation/d/${presId}/edit`,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SlidesService] Error during slides.create: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  public batchUpdate = async ({
    presentationId,
    requests: rawRequests,
  }: {
    presentationId: string;
    requests: string | slides_v1.Schema$Request[];
  }) => {
    const requests: slides_v1.Schema$Request[] =
      typeof rawRequests === 'string' ? JSON.parse(rawRequests) : rawRequests;
    logToFile(
      `[SlidesService] Starting batchUpdate for presentation: ${presentationId} (${requests.length} requests)`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();
      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: { requests },
      });

      logToFile(
        `[SlidesService] Finished batchUpdate for presentation: ${id}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response.data),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SlidesService] Error during slides.batchUpdate: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  private buildSlideRequests(
    slideId: string,
    elements: Array<{
      type: string;
      content?: string;
      shape_type?: string;
      url?: string;
      layer?: number;
      position: { x: number; y: number; w: number; h: number };
      style?: {
        size?: number;
        bold?: boolean;
        italic?: boolean;
        align?: string;
        vertical_align?: string;
        color?: ColorValue;
        bg_color?: ColorValue;
        border_color?: ColorValue;
        border_weight?: number;
        no_border?: boolean;
        font_family?: string;
        underline?: boolean;
        strikethrough?: boolean;
        indent?: number;
        bold_phrases?: string[];
        bold_until?: number;
        links?: Array<{ text: string; url: string }>;
      };
    }>,
    objCounter: { value: number },
    theme: Theme,
  ): slides_v1.Schema$Request[] {
    const requests: slides_v1.Schema$Request[] = [];

    const getId = (prefix: string) => {
      objCounter.value += 1;
      return `${prefix}_${Date.now()}_${objCounter.value}`;
    };

    // Sort: shapes first, then images, then text; within each group by layer
    const sortOrder = (el: { type: string; layer?: number }) => {
      const layerVal = el.layer ?? 1;
      const typeMap: Record<string, number> = {
        shape: 0,
        image: 1,
        text: 2,
      };
      const typeVal = typeMap[el.type] ?? 3;
      return layerVal * 10 + typeVal;
    };

    const sorted = [...elements].sort(
      (a, b) => sortOrder(a) - sortOrder(b),
    );

    for (const el of sorted) {
      const pos = el.position;
      const style = el.style || {};

      if (el.type === 'shape') {
        const objId = getId('sh');

        requests.push({
          createShape: {
            objectId: objId,
            shapeType: (el.shape_type as string) || 'RECTANGLE',
            elementProperties: {
              pageObjectId: slideId,
              size: {
                height: { magnitude: pos.h, unit: 'PT' },
                width: { magnitude: pos.w, unit: 'PT' },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: pos.x,
                translateY: pos.y,
                unit: 'PT',
              },
            },
          },
        });

        const props: any = {};
        const fields: string[] = [];

        const bgColor = resolveColor(style.bg_color, theme);
        if (bgColor) {
          props.shapeBackgroundFill = {
            solidFill: { color: { rgbColor: bgColor } },
          };
          fields.push('shapeBackgroundFill.solidFill.color');
        }

        const borderColor = resolveColor(style.border_color, theme);
        if (borderColor) {
          props.outline = {
            outlineFill: {
              solidFill: { color: { rgbColor: borderColor } },
            },
            weight: {
              magnitude: style.border_weight ?? 1,
              unit: 'PT',
            },
          };
          fields.push(
            'outline.outlineFill.solidFill.color',
            'outline.weight',
          );
        } else if (style.no_border) {
          props.outline = { propertyState: 'NOT_RENDERED' };
          fields.push('outline.propertyState');
        }

        if (style.vertical_align) {
          props.contentAlignment = style.vertical_align;
          fields.push('contentAlignment');
        }

        if (fields.length > 0) {
          requests.push({
            updateShapeProperties: {
              objectId: objId,
              shapeProperties: props,
              fields: fields.join(','),
            },
          });
        }
      } else if (el.type === 'image') {
        const objId = getId('img');
        // Sanitize URLs that contain unresolved template placeholders (e.g. from LLM output)
        let imageUrl = el.url ?? '';
        if (imageUrl.includes('{') || imageUrl.includes('%7B')) {
          imageUrl = 'https://img.icons8.com/m_rounded/512/4285F4/info.png';
        }

        requests.push({
          createImage: {
            objectId: objId,
            url: imageUrl,
            elementProperties: {
              pageObjectId: slideId,
              size: {
                height: { magnitude: pos.h, unit: 'PT' },
                width: { magnitude: pos.w, unit: 'PT' },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: pos.x,
                translateY: pos.y,
                unit: 'PT',
              },
            },
          },
        });
      } else if (el.type === 'text') {
        const objId = getId('tx');
        const content = el.content || '';

        requests.push({
          createShape: {
            objectId: objId,
            shapeType: 'TEXT_BOX',
            elementProperties: {
              pageObjectId: slideId,
              size: {
                height: { magnitude: pos.h, unit: 'PT' },
                width: { magnitude: pos.w, unit: 'PT' },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: pos.x,
                translateY: pos.y,
                unit: 'PT',
              },
            },
          },
        });

        requests.push({
          insertText: { objectId: objId, text: content },
        });

        // Base text style
        requests.push({
          updateTextStyle: {
            objectId: objId,
            style: {
              fontSize: { magnitude: style.size ?? 11, unit: 'PT' },
              bold: style.bold ?? false,
              italic: style.italic ?? false,
              foregroundColor: {
                opaqueColor: {
                  rgbColor: resolveColor(style.color, theme) ?? theme.text,
                },
              },
              fontFamily: style.font_family === 'theme'
                ? theme.fontFamily
                : (style.font_family ?? theme.fontFamily),
              underline: style.underline ?? false,
              strikethrough: style.strikethrough ?? false,
            },
            fields: 'fontSize,bold,italic,underline,strikethrough,foregroundColor,fontFamily',
          },
        });

        // Paragraph style
        requests.push({
          updateParagraphStyle: {
            objectId: objId,
            style: {
              alignment: style.align ?? 'START',
              ...(style.indent !== undefined && {
                indentStart: { magnitude: style.indent, unit: 'PT' },
              }),
            },
            fields:
              style.indent !== undefined ? 'alignment,indentStart' : 'alignment',
          },
        });

        // Vertical alignment
        if (style.vertical_align) {
          requests.push({
            updateShapeProperties: {
              objectId: objId,
              shapeProperties: {
                contentAlignment:
                  style.vertical_align as slides_v1.Schema$ShapeProperties['contentAlignment'],
              },
              fields: 'contentAlignment',
            },
          });
        }

        // Bold phrases
        if (style.bold_phrases) {
          for (const phrase of style.bold_phrases) {
            let searchFrom = 0;
            while (true) {
              const idx = content.indexOf(phrase, searchFrom);
              if (idx === -1) break;
              requests.push({
                updateTextStyle: {
                  objectId: objId,
                  style: { bold: true },
                  textRange: {
                    type: 'FIXED_RANGE',
                    startIndex: idx,
                    endIndex: idx + phrase.length,
                  },
                  fields: 'bold',
                },
              });
              searchFrom = idx + 1;
            }
          }
        }

        // Bold until (legacy)
        if (style.bold_until) {
          requests.push({
            updateTextStyle: {
              objectId: objId,
              style: { bold: true },
              textRange: {
                type: 'FIXED_RANGE',
                startIndex: 0,
                endIndex: style.bold_until,
              },
              fields: 'bold',
            },
          });
        }

        // Links
        if (style.links) {
          for (const linkDef of style.links) {
            let searchFrom = 0;
            while (true) {
              const idx = content.indexOf(linkDef.text, searchFrom);
              if (idx === -1) break;
              requests.push({
                updateTextStyle: {
                  objectId: objId,
                  style: {
                    link: { url: linkDef.url },
                  },
                  textRange: {
                    type: 'FIXED_RANGE',
                    startIndex: idx,
                    endIndex: idx + linkDef.text.length,
                  },
                  fields: 'link',
                },
              });
              searchFrom = idx + 1;
            }
          }
        }
      }
    }

    return requests;
  }

  public createFromJson = async ({
    presentationId,
    slideJson: rawSlideJson,
    theme: themeName,
  }: {
    presentationId: string;
    slideJson: string | Record<string, unknown>;
    theme?: string;
  }) => {
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slideJson: Record<string, unknown> =
        typeof rawSlideJson === 'string'
          ? JSON.parse(rawSlideJson)
          : rawSlideJson;

      // Default to 'light' when no theme specified
      const theme: Theme = THEMES[(themeName ?? 'light').toLowerCase()] ?? THEMES['light'];

      // Normalize: accept either slides[] or top-level elements[] (backward compat)
      const slideDefs = (slideJson as any).slides
        ? (slideJson as any).slides
        : [{ elements: (slideJson as any).elements || [] }];

      logToFile(
        `[SlidesService] Starting createFromJson for presentation: ${id} (${slideDefs.length} slides)`,
      );

      const requests: slides_v1.Schema$Request[] = [];
      const slideIds: string[] = [];
      const objCounter = { value: 0 };

      for (let i = 0; i < slideDefs.length; i++) {
        const slideId = `slide_${Date.now()}_${i}`;
        slideIds.push(slideId);

        requests.push({
          createSlide: {
            objectId: slideId,
            insertionIndex: i + 1,
            slideLayoutReference: { predefinedLayout: 'BLANK' },
          },
        });

        requests.push(
          ...this.buildSlideRequests(slideId, slideDefs[i].elements, objCounter, theme),
        );
      }

      // Execute the batch update to create slides + elements
      const slides = await this.getSlidesClient();
      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: { requests },
      });

      // Write speaker notes for any slide that has them in the blueprint
      const notesSlides = slideDefs
        .map((def: any, i: number) => ({ notes: def.speaker_notes, slideId: slideIds[i] }))
        .filter((s: any) => s.notes);

      if (notesSlides.length > 0) {
        logToFile(
          `[SlidesService] Writing speaker notes for ${notesSlides.length} slides`,
        );
        // Fetch the presentation to get speakerNotesObjectIds for the new slides
        const pres = await slides.presentations.get({
          presentationId: id,
          fields:
            'slides(objectId,slideProperties(notesPage(notesProperties(speakerNotesObjectId),pageElements(objectId,shape(text)))))',
        });

        const noteRequests: slides_v1.Schema$Request[] = [];
        for (const { notes, slideId } of notesSlides) {
          const slide = pres.data.slides?.find((s) => s.objectId === slideId);
          const notesObjId =
            slide?.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
          if (!notesObjId) continue;

          // Clear existing notes text if any
          const notesShape = slide?.slideProperties?.notesPage?.pageElements?.find(
            (el) => el.objectId === notesObjId,
          );
          if (notesShape?.shape?.text?.textElements?.length) {
            noteRequests.push({
              deleteText: { objectId: notesObjId, textRange: { type: 'ALL' } },
            });
          }
          noteRequests.push({
            insertText: { objectId: notesObjId, insertionIndex: 0, text: notes },
          });
        }

        if (noteRequests.length > 0) {
          await slides.presentations.batchUpdate({
            presentationId: id,
            requestBody: { requests: noteRequests },
          });
          logToFile(
            `[SlidesService] Wrote speaker notes for ${notesSlides.length} slides`,
          );
        }
      }

      // Delete the default blank slide ("p") that Google creates with new presentations
      try {
        await slides.presentations.batchUpdate({
          presentationId: id,
          requestBody: {
            requests: [{ deleteObject: { objectId: 'p' } }],
          },
        });
        logToFile('[SlidesService] Deleted default blank slide "p"');
      } catch {
        // Not critical — slide "p" may not exist (already deleted or presentation wasn't new)
      }

      const presLink = `https://docs.google.com/presentation/d/${id}/edit`;
      logToFile(
        `[SlidesService] Finished createFromJson for presentation: ${id}, ${slideIds.length} slides created`,
      );

      const hasNotes = notesSlides.length > 0;
      const result: Record<string, unknown> = {
        slideIds,
        presentationLink: presLink,
        slidesCreated: slideIds.length,
        repliesCount: response.data.replies?.length ?? 0,
      };

      if (!hasNotes && slideIds.length > 0) {
        result.speakerNotesStatus = 'MISSING';
        result.action_required =
          'No speaker notes were provided. Call slides.updateSpeakerNotes for each slideId above to add a talk track. A professional deck requires speaker notes on every slide.';
      } else if (hasNotes) {
        result.speakerNotesStatus = 'WRITTEN';
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SlidesService] Error during slides.createFromJson: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  // Speaker notes tools — approach adapted from
  // https://github.com/gemini-cli-extensions/workspace/pull/235
  // by @stefanoamorelli (MIT licence, same as this project).

  private formatResult(data: unknown) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    };
  }

  private formatError(method: string, error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logToFile(`[SlidesService] Error during ${method}: ${msg}`);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }],
    };
  }

  public getSpeakerNotes = async ({
    presentationId,
  }: {
    presentationId: string;
  }) => {
    logToFile(`[SlidesService] Getting speaker notes: ${presentationId}`);
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'slides(objectId,slideProperties(notesPage(notesProperties(speakerNotesObjectId),pageElements(objectId,shape(text)))))',
      });

      const notesPerSlide = (presentation.data.slides ?? []).map(
        (slide, index) => {
          const notesPage = slide.slideProperties?.notesPage;
          const speakerNotesObjectId =
            notesPage?.notesProperties?.speakerNotesObjectId;

          let notesText = '';
          if (speakerNotesObjectId && notesPage?.pageElements) {
            const notesShape = notesPage.pageElements.find(
              (el) => el.objectId === speakerNotesObjectId,
            );
            if (notesShape?.shape?.text) {
              notesText = this.extractTextFromTextContent(
                notesShape.shape.text,
              ).trim();
            }
          }

          return {
            slideIndex: index + 1,
            slideObjectId: slide.objectId,
            speakerNotesObjectId,
            notes: notesText,
          };
        },
      );

      logToFile(`[SlidesService] Retrieved speaker notes: ${id}`);
      return this.formatResult({ presentationId: id, slides: notesPerSlide });
    } catch (error) {
      return this.formatError('slides.getSpeakerNotes', error);
    }
  };

  public updateSpeakerNotes = async ({
    presentationId,
    slideObjectId,
    notes,
  }: {
    presentationId: string;
    slideObjectId: string;
    notes: string;
  }) => {
    logToFile(
      `[SlidesService] Updating speaker notes for slide ${slideObjectId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'slides(objectId,slideProperties(notesPage(notesProperties(speakerNotesObjectId),pageElements(objectId,shape(text)))))',
      });

      const slide = presentation.data.slides?.find(
        (s) => s.objectId === slideObjectId,
      );
      if (!slide) throw new Error(`Slide not found: ${slideObjectId}`);

      const speakerNotesObjectId =
        slide.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
      if (!speakerNotesObjectId)
        throw new Error(`Speaker notes object not found for slide: ${slideObjectId}`);

      const requests: slides_v1.Schema$Request[] = [];

      const notesShape = slide.slideProperties?.notesPage?.pageElements?.find(
        (el) => el.objectId === speakerNotesObjectId,
      );
      if (notesShape?.shape?.text?.textElements?.length) {
        requests.push({
          deleteText: {
            objectId: speakerNotesObjectId,
            textRange: { type: 'ALL' },
          },
        });
      }

      if (notes.length > 0) {
        requests.push({
          insertText: {
            objectId: speakerNotesObjectId,
            insertionIndex: 0,
            text: notes,
          },
        });
      }

      if (requests.length > 0) {
        await slides.presentations.batchUpdate({
          presentationId: id,
          requestBody: { requests },
        });
      }

      logToFile(`[SlidesService] Updated speaker notes for slide: ${slideObjectId}`);
      return this.formatResult({ presentationId: id, slideObjectId, speakerNotesObjectId, notes });
    } catch (error) {
      return this.formatError('slides.updateSpeakerNotes', error);
    }
  };

  public getSlideThumbnail = async ({
    presentationId,
    slideObjectId,
    localPath,
  }: {
    presentationId: string;
    slideObjectId: string;
    localPath: string;
  }) => {
    logToFile(
      `[SlidesService] Starting getSlideThumbnail for presentation: ${presentationId}, slide: ${slideObjectId} (localPath: ${localPath})`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();
      const thumbnail = await slides.presentations.pages.getThumbnail({
        presentationId: id,
        pageObjectId: slideObjectId,
      });

      const result: any = { ...thumbnail.data };

      if (result.contentUrl) {
        try {
          await this.downloadToLocal(result.contentUrl, localPath);
          result.localPath = localPath;
        } catch (downloadError) {
          logToFile(
            `[SlidesService] Failed to download thumbnail for slide ${slideObjectId}: ${downloadError}`,
          );
          result.downloadError = String(downloadError);
        }
      }

      logToFile(
        `[SlidesService] Finished getSlideThumbnail for slide: ${slideObjectId}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SlidesService] Error during slides.getSlideThumbnail: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };
}
