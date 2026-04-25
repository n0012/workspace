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
        color?: { red: number; green: number; blue: number };
        bg_color?: { red: number; green: number; blue: number };
        border_color?: { red: number; green: number; blue: number };
        border_weight?: number;
        no_border?: boolean;
        font_family?: string;
        underline?: boolean;
        strikethrough?: boolean;
        bold_phrases?: string[];
        bold_until?: number;
        links?: Array<{ text: string; url: string }>;
      };
    }>,
    objCounter: { value: number },
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

        if (style.bg_color) {
          props.shapeBackgroundFill = {
            solidFill: { color: { rgbColor: style.bg_color } },
          };
          fields.push('shapeBackgroundFill.solidFill.color');
        }

        if (style.border_color) {
          props.outline = {
            outlineFill: {
              solidFill: { color: { rgbColor: style.border_color } },
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

        requests.push({
          createImage: {
            objectId: objId,
            url: el.url,
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
                  rgbColor: style.color ?? {
                    red: 0,
                    green: 0,
                    blue: 0,
                  },
                },
              },
              fontFamily: style.font_family ?? 'Arial',
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
            },
            fields: 'alignment',
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
  }: {
    presentationId: string;
    slideJson: string | Record<string, unknown>;
  }) => {
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slideJson: Record<string, unknown> =
        typeof rawSlideJson === 'string'
          ? JSON.parse(rawSlideJson)
          : rawSlideJson;

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
          ...this.buildSlideRequests(slideId, slideDefs[i].elements, objCounter),
        );
      }

      // Execute the batch update
      const slides = await this.getSlidesClient();
      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: { requests },
      });

      const presLink = `https://docs.google.com/presentation/d/${id}/edit`;
      logToFile(
        `[SlidesService] Finished createFromJson for presentation: ${id}, ${slideIds.length} slides created`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              slideIds,
              presentationLink: presLink,
              slidesCreated: slideIds.length,
              repliesCount: response.data.replies?.length ?? 0,
            }),
          },
        ],
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
