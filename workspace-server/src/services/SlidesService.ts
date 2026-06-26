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

// === Theme system (used by createFromJson) ===

type RGB = { red: number; green: number; blue: number };
type ColorValue = RGB | string;

interface Theme {
  primary: RGB; // Header / primary accent background
  primaryText: RGB; // Text on primary background
  secondary: RGB; // Secondary accent
  secondaryText: RGB; // Text on secondary background
  surface: RGB; // Card / box background (primary tint)
  surfaceAlt: RGB; // Card / box background (secondary tint)
  text: RGB; // Default body text
  textMuted: RGB; // Muted / caption text
  background: RGB; // Slide background
  fontFamily: string; // Default font family
  // Extended accent palette — used when an accent alias is referenced.
  accent1?: RGB;
  accent2?: RGB;
  accent3?: RGB;
  accent4?: RGB;
}

/**
 * Built-in themes for createFromJson. Two ship today: a neutral light theme
 * (`default`) and a dark theme (`dark`). Color aliases resolve against the
 * active theme so blueprints stay theme-portable.
 */
export const THEMES: Record<string, Theme> = {
  default: {
    primary: { red: 0.125, green: 0.129, blue: 0.141 }, // #202124 near-black (headers)
    primaryText: { red: 1.0, green: 1.0, blue: 1.0 },
    secondary: { red: 0.102, green: 0.451, blue: 0.91 }, // #1A73E8 blue accent
    secondaryText: { red: 1.0, green: 1.0, blue: 1.0 },
    surface: { red: 0.91, green: 0.941, blue: 0.996 }, // light blue tint
    surfaceAlt: { red: 0.902, green: 0.957, blue: 0.918 }, // light green tint
    text: { red: 0.122, green: 0.122, blue: 0.122 }, // #1F1F1F
    textMuted: { red: 0.267, green: 0.278, blue: 0.275 }, // #444746
    background: { red: 1.0, green: 1.0, blue: 1.0 },
    fontFamily: 'Arial',
    accent1: { red: 0.263, green: 0.522, blue: 0.957 }, // blue
    accent2: { red: 0.918, green: 0.263, blue: 0.208 }, // red
    accent3: { red: 0.984, green: 0.737, blue: 0.02 }, // yellow
    accent4: { red: 0.204, green: 0.659, blue: 0.325 }, // green
  },
  dark: {
    primary: { red: 0.129, green: 0.588, blue: 0.953 }, // bright blue accent on dark
    primaryText: { red: 1.0, green: 1.0, blue: 1.0 },
    secondary: { red: 0.611, green: 0.353, blue: 0.949 }, // purple accent
    secondaryText: { red: 1.0, green: 1.0, blue: 1.0 },
    surface: { red: 0.157, green: 0.165, blue: 0.184 }, // #282A2F card
    surfaceAlt: { red: 0.204, green: 0.212, blue: 0.235 }, // slightly lighter card
    text: { red: 0.925, green: 0.933, blue: 0.945 }, // near-white body
    textMuted: { red: 0.667, green: 0.678, blue: 0.698 }, // muted gray
    background: { red: 0.075, green: 0.082, blue: 0.094 }, // #131517 slide bg
    fontFamily: 'Arial',
    accent1: { red: 0.4, green: 0.624, blue: 0.969 }, // blue
    accent2: { red: 0.969, green: 0.451, blue: 0.408 }, // red
    accent3: { red: 1.0, green: 0.831, blue: 0.31 }, // yellow
    accent4: { red: 0.388, green: 0.776, blue: 0.494 }, // green
  },
};

export const DEFAULT_THEME = 'default';

const COLOR_ALIASES: Record<string, keyof Theme> = {
  primary: 'primary',
  primary_text: 'primaryText',
  secondary: 'secondary',
  secondary_text: 'secondaryText',
  surface: 'surface',
  surface_alt: 'surfaceAlt',
  text: 'text',
  text_muted: 'textMuted',
  background: 'background',
  accent1: 'accent1',
  accent2: 'accent2',
  accent3: 'accent3',
  accent4: 'accent4',
  // Convenience semantic aliases for the accent palette.
  blue: 'accent1',
  red: 'accent2',
  yellow: 'accent3',
  green: 'accent4',
};

/**
 * Resolve a color value: pass RGB objects through, resolve string aliases via
 * the active theme. Returns undefined for an unknown alias.
 */
export function resolveColor(
  color: ColorValue | undefined,
  theme: Theme,
): RGB | undefined {
  if (!color) return undefined;
  if (typeof color !== 'string') return color as RGB;
  const key = COLOR_ALIASES[color.toLowerCase()];
  return key ? (theme[key] as RGB) : undefined;
}

export const PREDEFINED_LAYOUTS = [
  'BLANK',
  'TITLE',
  'TITLE_AND_BODY',
  'TITLE_AND_TWO_COLUMNS',
  'TITLE_ONLY',
  'SECTION_HEADER',
  'SECTION_TITLE_AND_DESCRIPTION',
  'ONE_COLUMN_TEXT',
  'MAIN_POINT',
  'BIG_NUMBER',
] as const;
export type PredefinedLayout = (typeof PREDEFINED_LAYOUTS)[number];

export const RANGE_TYPES = ['ALL', 'FIXED_RANGE', 'FROM_START_INDEX'] as const;
export type RangeType = (typeof RANGE_TYPES)[number];

export type SlidesTextRange =
  | { type: 'ALL' }
  | { type: 'FIXED_RANGE'; startIndex: number; endIndex: number }
  | { type: 'FROM_START_INDEX'; startIndex: number };

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
};

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

  private parseJsonObject(
    raw: string,
    paramName: string,
    example: string,
  ): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Invalid JSON for ${paramName} parameter: ${detail}. Expected a JSON string like '${example}'.`,
      );
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      const got =
        parsed === null
          ? 'null'
          : Array.isArray(parsed)
            ? 'array'
            : typeof parsed;
      throw new Error(
        `Invalid ${paramName} parameter: expected a JSON object, got ${got}.`,
      );
    }
    return parsed as Record<string, unknown>;
  }

  private buildRange(range: SlidesTextRange): slides_v1.Schema$Range {
    // The discriminated union at the Zod boundary makes invalid shapes
    // unrepresentable for MCP callers, but the service can also be invoked
    // directly (e.g. from tests or other code paths) so we re-validate the
    // discriminant value defensively.
    if (!RANGE_TYPES.includes(range.type)) {
      throw new Error(
        `Invalid range type "${range.type}". Expected one of: ${RANGE_TYPES.join(', ')}.`,
      );
    }
    if (range.type === 'FIXED_RANGE') {
      if (range.startIndex === undefined || range.endIndex === undefined) {
        throw new Error('FIXED_RANGE requires both startIndex and endIndex.');
      }
      return {
        type: range.type,
        startIndex: range.startIndex,
        endIndex: range.endIndex,
      };
    }
    if (range.type === 'FROM_START_INDEX') {
      if (range.startIndex === undefined) {
        throw new Error('FROM_START_INDEX requires startIndex.');
      }
      return { type: range.type, startIndex: range.startIndex };
    }
    return { type: range.type };
  }

  private formatError(method: string, error: unknown): ToolResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logToFile(`[SlidesService] Error during ${method}: ${errorMessage}`);
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: errorMessage }),
        },
      ],
    };
  }

  private formatResult(data: unknown): ToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(data),
        },
      ],
    };
  }

  public create = async ({ title }: { title: string }) => {
    logToFile(`[SlidesService] Creating presentation: ${title}`);
    try {
      const slides = await this.getSlidesClient();
      const presentation = await slides.presentations.create({
        requestBody: { title },
      });

      const result = {
        presentationId: presentation.data.presentationId,
        title: presentation.data.title,
        url: `https://docs.google.com/presentation/d/${presentation.data.presentationId}/edit`,
      };

      logToFile(
        `[SlidesService] Created presentation: ${result.presentationId}`,
      );
      return this.formatResult(result);
    } catch (error) {
      return this.formatError('slides.create', error);
    }
  };

  public addSlide = async ({
    presentationId,
    insertionIndex,
    layoutId,
    predefinedLayout,
    objectId,
  }: {
    presentationId: string;
    insertionIndex?: number;
    layoutId?: string;
    predefinedLayout?: PredefinedLayout;
    objectId?: string;
  }) => {
    logToFile(
      `[SlidesService] Adding slide to presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const createSlideRequest: slides_v1.Schema$CreateSlideRequest = {};
      if (insertionIndex !== undefined) {
        createSlideRequest.insertionIndex = insertionIndex;
      }
      if (objectId) {
        createSlideRequest.objectId = objectId;
      }
      if (layoutId) {
        createSlideRequest.slideLayoutReference = { layoutId };
      } else if (predefinedLayout) {
        if (!PREDEFINED_LAYOUTS.includes(predefinedLayout)) {
          throw new Error(
            `Invalid predefinedLayout "${predefinedLayout}". Expected one of: ${PREDEFINED_LAYOUTS.join(', ')}.`,
          );
        }
        createSlideRequest.slideLayoutReference = { predefinedLayout };
      }

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ createSlide: createSlideRequest }],
        },
      });

      const slideObjectId = response.data.replies?.[0]?.createSlide?.objectId;
      if (!slideObjectId) {
        throw new Error(
          'createSlide returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Added slide: ${slideObjectId}`);
      return this.formatResult({
        presentationId: id,
        slideObjectId,
      });
    } catch (error) {
      return this.formatError('slides.addSlide', error);
    }
  };

  public deleteSlide = async ({
    presentationId,
    slideObjectId,
  }: {
    presentationId: string;
    slideObjectId: string;
  }) => {
    logToFile(
      `[SlidesService] Deleting slide ${slideObjectId} from presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ deleteObject: { objectId: slideObjectId } }],
        },
      });

      logToFile(`[SlidesService] Deleted slide: ${slideObjectId}`);
      return this.formatResult({
        presentationId: id,
        deletedSlideObjectId: slideObjectId,
      });
    } catch (error) {
      return this.formatError('slides.deleteSlide', error);
    }
  };

  public duplicateSlide = async ({
    presentationId,
    slideObjectId,
  }: {
    presentationId: string;
    slideObjectId: string;
  }) => {
    logToFile(
      `[SlidesService] Duplicating slide ${slideObjectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ duplicateObject: { objectId: slideObjectId } }],
        },
      });

      const newObjectId = response.data.replies?.[0]?.duplicateObject?.objectId;
      if (!newObjectId) {
        throw new Error(
          'duplicateObject returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Duplicated slide to: ${newObjectId}`);
      return this.formatResult({
        presentationId: id,
        sourceSlideObjectId: slideObjectId,
        newSlideObjectId: newObjectId,
      });
    } catch (error) {
      return this.formatError('slides.duplicateSlide', error);
    }
  };

  public reorderSlides = async ({
    presentationId,
    slideObjectIds,
    insertionIndex,
  }: {
    presentationId: string;
    slideObjectIds: string[];
    insertionIndex: number;
  }) => {
    logToFile(
      `[SlidesService] Reordering slides in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              updateSlidesPosition: {
                slideObjectIds,
                insertionIndex,
              },
            },
          ],
        },
      });

      logToFile(`[SlidesService] Reordered slides in presentation: ${id}`);
      return this.formatResult({
        presentationId: id,
        slideObjectIds,
        insertionIndex,
      });
    } catch (error) {
      return this.formatError('slides.reorderSlides', error);
    }
  };

  public getSpeakerNotes = async ({
    presentationId,
  }: {
    presentationId: string;
  }) => {
    logToFile(
      `[SlidesService] Getting speaker notes for presentation: ${presentationId}`,
    );
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
            slideIndex: index,
            slideObjectId: slide.objectId,
            speakerNotesObjectId,
            notes: notesText,
          };
        },
      );

      logToFile(
        `[SlidesService] Retrieved speaker notes for presentation: ${id}`,
      );
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
      `[SlidesService] Updating speaker notes for slide ${slideObjectId} in presentation: ${presentationId}`,
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
      if (!slide) {
        throw new Error(`Slide not found: ${slideObjectId}`);
      }

      const speakerNotesObjectId =
        slide.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
      if (!speakerNotesObjectId) {
        throw new Error(
          `Speaker notes object not found for slide: ${slideObjectId}`,
        );
      }

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

      const noOp = requests.length === 0;
      if (!noOp) {
        await slides.presentations.batchUpdate({
          presentationId: id,
          requestBody: { requests },
        });
      } else {
        logToFile(
          `[SlidesService] updateSpeakerNotes is a no-op for slide ${slideObjectId} (existing notes already match input).`,
        );
      }

      logToFile(
        `[SlidesService] Updated speaker notes for slide: ${slideObjectId}`,
      );
      return this.formatResult({
        presentationId: id,
        slideObjectId,
        speakerNotesObjectId,
        notes,
        noOp,
      });
    } catch (error) {
      return this.formatError('slides.updateSpeakerNotes', error);
    }
  };

  public replaceAllText = async ({
    presentationId,
    findText,
    replaceText,
    matchCase = true,
  }: {
    presentationId: string;
    findText: string;
    replaceText: string;
    matchCase?: boolean;
  }) => {
    logToFile(
      `[SlidesService] Replacing all text in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              replaceAllText: {
                containsText: { text: findText, matchCase },
                replaceText,
              },
            },
          ],
        },
      });

      const replaceReply = response.data.replies?.[0]?.replaceAllText;
      if (!replaceReply) {
        throw new Error(
          'replaceAllText returned no reply; batchUpdate reply was empty or malformed.',
        );
      }
      // Google omits `occurrencesChanged` when zero matches were found, so a
      // missing field within a present reply is a legitimate zero.
      const occurrencesChanged = replaceReply.occurrencesChanged ?? 0;

      logToFile(
        `[SlidesService] Replaced ${occurrencesChanged} occurrences in presentation: ${id}`,
      );
      return this.formatResult({
        presentationId: id,
        findText,
        replaceText,
        occurrencesChanged,
      });
    } catch (error) {
      return this.formatError('slides.replaceAllText', error);
    }
  };

  public insertText = async ({
    presentationId,
    objectId,
    text,
    insertionIndex = 0,
  }: {
    presentationId: string;
    objectId: string;
    text: string;
    insertionIndex?: number;
  }) => {
    logToFile(
      `[SlidesService] Inserting text into object ${objectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              insertText: {
                objectId,
                insertionIndex,
                text,
              },
            },
          ],
        },
      });

      logToFile(
        `[SlidesService] Inserted text into object ${objectId} in presentation: ${id}`,
      );
      return this.formatResult({
        presentationId: id,
        objectId,
        insertionIndex,
        textLength: text.length,
      });
    } catch (error) {
      return this.formatError('slides.insertText', error);
    }
  };

  public deleteText = async ({
    presentationId,
    objectId,
    range = { type: 'ALL' },
  }: {
    presentationId: string;
    objectId: string;
    range?: SlidesTextRange;
  }) => {
    logToFile(
      `[SlidesService] Deleting text from object ${objectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const textRange = this.buildRange(range);

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              deleteText: {
                objectId,
                textRange,
              },
            },
          ],
        },
      });

      logToFile(
        `[SlidesService] Deleted text from object ${objectId} in presentation: ${id}`,
      );
      return this.formatResult({
        presentationId: id,
        objectId,
        textRange,
      });
    } catch (error) {
      return this.formatError('slides.deleteText', error);
    }
  };

  public addShape = async ({
    presentationId,
    slideObjectId,
    shapeType,
    x,
    y,
    width,
    height,
    objectId,
  }: {
    presentationId: string;
    slideObjectId: string;
    shapeType: string;
    x: number;
    y: number;
    width: number;
    height: number;
    objectId?: string;
  }) => {
    logToFile(
      `[SlidesService] Adding shape to slide ${slideObjectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const createShapeRequest: slides_v1.Schema$CreateShapeRequest = {
        shapeType,
        elementProperties: {
          pageObjectId: slideObjectId,
          size: {
            width: { magnitude: width, unit: 'PT' },
            height: { magnitude: height, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: x,
            translateY: y,
            unit: 'PT',
          },
        },
      };
      if (objectId) {
        createShapeRequest.objectId = objectId;
      }

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ createShape: createShapeRequest }],
        },
      });

      const newObjectId = response.data.replies?.[0]?.createShape?.objectId;
      if (!newObjectId) {
        throw new Error(
          'createShape returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Added shape: ${newObjectId}`);
      return this.formatResult({
        presentationId: id,
        slideObjectId,
        shapeObjectId: newObjectId,
        shapeType,
      });
    } catch (error) {
      return this.formatError('slides.addShape', error);
    }
  };

  public addImage = async ({
    presentationId,
    slideObjectId,
    imageUrl,
    x,
    y,
    width,
    height,
    objectId,
  }: {
    presentationId: string;
    slideObjectId: string;
    imageUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    objectId?: string;
  }) => {
    logToFile(
      `[SlidesService] Adding image to slide ${slideObjectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const createImageRequest: slides_v1.Schema$CreateImageRequest = {
        url: imageUrl,
        elementProperties: {
          pageObjectId: slideObjectId,
          size: {
            width: { magnitude: width, unit: 'PT' },
            height: { magnitude: height, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: x,
            translateY: y,
            unit: 'PT',
          },
        },
      };
      if (objectId) {
        createImageRequest.objectId = objectId;
      }

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ createImage: createImageRequest }],
        },
      });

      const newObjectId = response.data.replies?.[0]?.createImage?.objectId;
      if (!newObjectId) {
        throw new Error(
          'createImage returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Added image: ${newObjectId}`);
      return this.formatResult({
        presentationId: id,
        slideObjectId,
        imageObjectId: newObjectId,
        imageUrl,
      });
    } catch (error) {
      return this.formatError('slides.addImage', error);
    }
  };

  public addTable = async ({
    presentationId,
    slideObjectId,
    rows,
    columns,
    x,
    y,
    width,
    height,
    objectId,
  }: {
    presentationId: string;
    slideObjectId: string;
    rows: number;
    columns: number;
    x: number;
    y: number;
    width: number;
    height: number;
    objectId?: string;
  }) => {
    logToFile(
      `[SlidesService] Adding table to slide ${slideObjectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const createTableRequest: slides_v1.Schema$CreateTableRequest = {
        rows,
        columns,
        elementProperties: {
          pageObjectId: slideObjectId,
          size: {
            width: { magnitude: width, unit: 'PT' },
            height: { magnitude: height, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: x,
            translateY: y,
            unit: 'PT',
          },
        },
      };
      if (objectId) {
        createTableRequest.objectId = objectId;
      }

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ createTable: createTableRequest }],
        },
      });

      const newObjectId = response.data.replies?.[0]?.createTable?.objectId;
      if (!newObjectId) {
        throw new Error(
          'createTable returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Added table: ${newObjectId}`);
      return this.formatResult({
        presentationId: id,
        slideObjectId,
        tableObjectId: newObjectId,
        rows,
        columns,
      });
    } catch (error) {
      return this.formatError('slides.addTable', error);
    }
  };

  public updateTextStyle = async ({
    presentationId,
    objectId,
    style,
    range = { type: 'ALL' },
    fields,
  }: {
    presentationId: string;
    objectId: string;
    style: string;
    range?: SlidesTextRange;
    fields: string;
  }) => {
    logToFile(
      `[SlidesService] Updating text style for object ${objectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const parsedStyle = this.parseJsonObject(
        style,
        'style',
        '{"bold": true}',
      ) as slides_v1.Schema$TextStyle;

      const textRange = this.buildRange(range);

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              updateTextStyle: {
                objectId,
                textRange,
                style: parsedStyle,
                fields,
              },
            },
          ],
        },
      });

      logToFile(
        `[SlidesService] Updated text style for object ${objectId} in presentation: ${id}`,
      );
      return this.formatResult({
        presentationId: id,
        objectId,
        textRange,
        fields,
      });
    } catch (error) {
      return this.formatError('slides.updateTextStyle', error);
    }
  };

  public updateShapeProperties = async ({
    presentationId,
    objectId,
    shapeProperties,
    fields,
  }: {
    presentationId: string;
    objectId: string;
    shapeProperties: string;
    fields: string;
  }) => {
    logToFile(
      `[SlidesService] Updating shape properties for object ${objectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const parsedProps = this.parseJsonObject(
        shapeProperties,
        'shapeProperties',
        '{"shapeBackgroundFill": {...}}',
      ) as slides_v1.Schema$ShapeProperties;

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              updateShapeProperties: {
                objectId,
                shapeProperties: parsedProps,
                fields,
              },
            },
          ],
        },
      });

      logToFile(
        `[SlidesService] Updated shape properties for object ${objectId} in presentation: ${id}`,
      );
      return this.formatResult({
        presentationId: id,
        objectId,
        fields,
      });
    } catch (error) {
      return this.formatError('slides.updateShapeProperties', error);
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

  /**
   * Raw passthrough to presentations.batchUpdate. Escape hatch for arbitrary or
   * complex edits to an existing deck that the granular tools don't cover.
   * Accepts either a parsed array of requests or a JSON string of that array.
   */
  public batchUpdate = async ({
    presentationId,
    requests: rawRequests,
  }: {
    presentationId: string;
    requests: string | slides_v1.Schema$Request[];
  }) => {
    try {
      const requests: slides_v1.Schema$Request[] =
        typeof rawRequests === 'string' ? JSON.parse(rawRequests) : rawRequests;
      const id = extractDocId(presentationId) || presentationId;
      logToFile(
        `[SlidesService] Starting batchUpdate for presentation: ${id} (${requests.length} requests)`,
      );
      const slides = await this.getSlidesClient();
      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: { requests },
      });
      logToFile(`[SlidesService] Finished batchUpdate for presentation: ${id}`);
      return this.formatResult(response.data);
    } catch (error) {
      return this.formatError('slides.batchUpdate', error);
    }
  };

  /**
   * Translate a list of blueprint elements for one slide into Slides API
   * requests. Placeholder image URLs are swapped for a fallback icon and the
   * substitution is recorded in `warnings`.
   */
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
    slideIndex: number,
    warnings: Array<{
      slideIndex: number;
      elementIndex: number;
      issue: string;
    }>,
  ): slides_v1.Schema$Request[] {
    const requests: slides_v1.Schema$Request[] = [];

    const getId = (prefix: string) => {
      objCounter.value += 1;
      return `${prefix}_${Date.now()}_${objCounter.value}`;
    };

    // Render order is driven by `layer` (lower renders first); element type is
    // only the tiebreaker within a layer (shape < image < text). This keeps
    // backgrounds behind text without manual sequencing.
    const sortOrder = (el: { type: string; layer?: number }) => {
      const layerVal = el.layer ?? 1;
      const typeMap: Record<string, number> = { shape: 0, image: 1, text: 2 };
      const typeVal = typeMap[el.type] ?? 3;
      return layerVal * 10 + typeVal;
    };

    // Keep original indices so warnings point at the caller's blueprint.
    const sorted = elements
      .map((el, elementIndex) => ({ el, elementIndex }))
      .sort((a, b) => sortOrder(a.el) - sortOrder(b.el));

    for (const { el, elementIndex } of sorted) {
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

        const props: slides_v1.Schema$ShapeProperties = {};
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
            outlineFill: { solidFill: { color: { rgbColor: borderColor } } },
            weight: { magnitude: style.border_weight ?? 1, unit: 'PT' },
          };
          fields.push('outline.outlineFill.solidFill.color', 'outline.weight');
        } else if (style.no_border) {
          props.outline = { propertyState: 'NOT_RENDERED' };
          fields.push('outline.propertyState');
        }

        if (style.vertical_align) {
          props.contentAlignment =
            style.vertical_align as slides_v1.Schema$ShapeProperties['contentAlignment'];
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
        // Sanitize URLs that still contain unresolved template placeholders
        // (common in raw LLM output) and surface the substitution to the caller.
        let imageUrl = el.url ?? '';
        if (imageUrl.includes('{') || imageUrl.includes('%7B')) {
          warnings.push({
            slideIndex,
            elementIndex,
            issue: `unresolved url placeholder, substituted fallback icon (original: ${imageUrl})`,
          });
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

        requests.push({ insertText: { objectId: objId, text: content } });

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
              fontFamily:
                style.font_family === 'theme'
                  ? theme.fontFamily
                  : (style.font_family ?? theme.fontFamily),
              underline: style.underline ?? false,
              strikethrough: style.strikethrough ?? false,
            },
            fields:
              'fontSize,bold,italic,underline,strikethrough,foregroundColor,fontFamily',
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
              style.indent !== undefined
                ? 'alignment,indentStart'
                : 'alignment',
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

        // Bold specific phrases (every occurrence). Skip empties — an empty
        // phrase makes indexOf return a zero-length match for every position,
        // emitting invalid startIndex===endIndex requests the API rejects.
        if (style.bold_phrases) {
          for (const phrase of style.bold_phrases) {
            if (!phrase) continue;
            let searchFrom = 0;
            for (;;) {
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
              searchFrom = idx + phrase.length;
            }
          }
        }

        // Bold a leading character range (e.g. an inline lead-in).
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

        // Hyperlinks on specific phrases (every occurrence). Skip empties for
        // the same zero-length-match reason as bold_phrases.
        if (style.links) {
          for (const linkDef of style.links) {
            if (!linkDef.text) continue;
            let searchFrom = 0;
            for (;;) {
              const idx = content.indexOf(linkDef.text, searchFrom);
              if (idx === -1) break;
              requests.push({
                updateTextStyle: {
                  objectId: objId,
                  style: { link: { url: linkDef.url } },
                  textRange: {
                    type: 'FIXED_RANGE',
                    startIndex: idx,
                    endIndex: idx + linkDef.text.length,
                  },
                  fields: 'link',
                },
              });
              searchFrom = idx + linkDef.text.length;
            }
          }
        }
      }
    }

    return requests;
  }

  /**
   * Build one or more slides from a JSON blueprint and append them to an
   * existing presentation. Speaker notes in the blueprint are written inline.
   *
   * When `isNewPresentation` is true, the default blank slide that Google
   * creates with a brand-new presentation is removed after the blueprint slides
   * are added. It is left untouched otherwise so appending to an existing deck
   * never deletes the caller's content.
   */
  public createFromJson = async ({
    presentationId,
    slideJson: rawSlideJson,
    theme: themeName,
    isNewPresentation = false,
  }: {
    presentationId: string;
    slideJson: string | Record<string, unknown>;
    theme?: string;
    isNewPresentation?: boolean;
  }) => {
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slideJson: Record<string, unknown> =
        typeof rawSlideJson === 'string'
          ? JSON.parse(rawSlideJson)
          : rawSlideJson;

      const theme: Theme =
        THEMES[(themeName ?? DEFAULT_THEME).toLowerCase()] ??
        THEMES[DEFAULT_THEME];

      // Accept either slides[] or a single top-level elements[]. Guard against
      // a slide object that omits `elements` so buildSlideRequests never spreads
      // undefined.
      const slideDefs: Array<{ elements: unknown[]; speaker_notes?: string }> =
        Array.isArray((slideJson as any).slides)
          ? (slideJson as any).slides.map((s: any) => ({
              ...s,
              elements: s.elements || [],
            }))
          : [{ elements: (slideJson as any).elements || [] }];

      logToFile(
        `[SlidesService] Starting createFromJson for presentation: ${id} (${slideDefs.length} slides)`,
      );

      const requests: slides_v1.Schema$Request[] = [];
      const slideIds: string[] = [];
      const objCounter = { value: 0 };
      const warnings: Array<{
        slideIndex: number;
        elementIndex: number;
        issue: string;
      }> = [];

      for (let i = 0; i < slideDefs.length; i++) {
        const slideId = `slide_${Date.now()}_${i}`;
        slideIds.push(slideId);

        // No insertionIndex — append to the end. A fixed index would reverse
        // order when createFromJson is called once per slide.
        requests.push({
          createSlide: {
            objectId: slideId,
            slideLayoutReference: { predefinedLayout: 'BLANK' },
          },
        });

        requests.push(
          ...this.buildSlideRequests(
            slideId,
            slideDefs[i].elements as any,
            objCounter,
            theme,
            i,
            warnings,
          ),
        );
      }

      const slides = await this.getSlidesClient();
      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: { requests },
      });

      // Write speaker notes for any slide that supplied them.
      const notesSlides = slideDefs
        .map((def, i) => ({ notes: def.speaker_notes, slideId: slideIds[i] }))
        .filter((s) => s.notes);

      if (notesSlides.length > 0) {
        logToFile(
          `[SlidesService] Writing speaker notes for ${notesSlides.length} slides`,
        );
        const pres = await slides.presentations.get({
          presentationId: id,
          fields:
            'slides(objectId,slideProperties(notesPage(notesProperties(speakerNotesObjectId),pageElements(objectId,shape(text)))))',
        });

        const noteRequests: slides_v1.Schema$Request[] = [];
        for (const { notes, slideId } of notesSlides) {
          const slide = pres.data.slides?.find((s) => s.objectId === slideId);
          const notesObjId =
            slide?.slideProperties?.notesPage?.notesProperties
              ?.speakerNotesObjectId;
          if (!notesObjId) continue;

          const notesShape =
            slide?.slideProperties?.notesPage?.pageElements?.find(
              (el) => el.objectId === notesObjId,
            );
          if (notesShape?.shape?.text?.textElements?.length) {
            noteRequests.push({
              deleteText: { objectId: notesObjId, textRange: { type: 'ALL' } },
            });
          }
          noteRequests.push({
            insertText: {
              objectId: notesObjId,
              insertionIndex: 0,
              text: notes,
            },
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

      // Remove the default blank slide ("p") only for a brand-new presentation,
      // and only after confirming it actually exists — never silently delete a
      // real slide when appending to an existing deck.
      if (isNewPresentation) {
        try {
          const pres = await slides.presentations.get({
            presentationId: id,
            fields: 'slides(objectId)',
          });
          const hasDefault = pres.data.slides?.some((s) => s.objectId === 'p');
          if (hasDefault) {
            await slides.presentations.batchUpdate({
              presentationId: id,
              requestBody: { requests: [{ deleteObject: { objectId: 'p' } }] },
            });
            logToFile('[SlidesService] Deleted default blank slide "p"');
          }
        } catch (delError) {
          logToFile(
            `[SlidesService] Could not remove default slide "p": ${
              delError instanceof Error ? delError.message : String(delError)
            }`,
          );
        }
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
      if (warnings.length > 0) result.warnings = warnings;

      if (!hasNotes && slideIds.length > 0) {
        result.speakerNotesStatus = 'MISSING';
        result.action_required =
          'No speaker notes were provided. Call slides.updateSpeakerNotes for each slideId above to add a talk track. Speaker notes are strongly recommended on every slide.';
      } else if (hasNotes) {
        result.speakerNotesStatus = 'WRITTEN';
      }

      return this.formatResult(result);
    } catch (error) {
      return this.formatError('slides.createFromJson', error);
    }
  };
}
