import { requestUrl, RequestUrlResponse } from 'obsidian';
import {
  BookStackListResponse,
  BookStackBook,
  BookStackBookContents,
  BookStackPage,
  BookStackChapter,
  BookStackImage,
  BookStackAttachment,
  BookStackAttachmentDetail,
} from './types';

const MAX_REQUESTS_PER_SECOND = 10;
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 100;

export class BookStackClient {
  private requestTimestamps: number[] = [];

  constructor(
    private baseUrl: string,
    private tokenId: string,
    private tokenSecret: string,
    private timeout: number = DEFAULT_TIMEOUT,
  ) {}

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    // Remove timestamps older than 1 second
    this.requestTimestamps = this.requestTimestamps.filter(
      (t) => now - t < 1000,
    );

    if (this.requestTimestamps.length >= MAX_REQUESTS_PER_SECOND) {
      const oldest = this.requestTimestamps[0];
      const waitMs = 1000 - (now - oldest);
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }
    }

    this.requestTimestamps.push(Date.now());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async request<T>(
    endpoint: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    await this.rateLimit();

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response: RequestUrlResponse = await requestUrl({
          url: `${this.baseUrl}/api/${endpoint}`,
          method,
          headers: {
            Authorization: `Token ${this.tokenId}:${this.tokenSecret}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          throw: false,
        });

        if (response.status === 429 && attempt < MAX_RETRIES) {
          const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }

        if (response.status === 401) {
          throw new BookStackAuthError('Authentication failed. Check your API token.');
        }

        if (response.status === 404) {
          throw new BookStackNotFoundError(`Resource not found: ${endpoint}`);
        }

        if (response.status >= 400) {
          const message = response.json?.error?.message ?? `HTTP ${response.status}`;
          throw new BookStackApiError(message, response.status);
        }

        return response.json as T;
      } catch (error) {
        if (
          error instanceof BookStackAuthError ||
          error instanceof BookStackNotFoundError ||
          error instanceof BookStackApiError
        ) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES) {
          const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  /** Test the connection by fetching the books list */
  async testConnection(): Promise<boolean> {
    await this.getBooks(1);
    return true;
  }

  async getBooks(count = 500, offset = 0): Promise<BookStackListResponse<BookStackBook>> {
    return this.request<BookStackListResponse<BookStackBook>>(
      `books?count=${count}&offset=${offset}`,
    );
  }

  async getAllBooks(): Promise<BookStackBook[]> {
    const books: BookStackBook[] = [];
    let offset = 0;
    const count = 500;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await this.getBooks(count, offset);
      books.push(...response.data);
      if (books.length >= response.total) break;
      offset += count;
    }

    return books;
  }

  async getBookContents(id: number): Promise<BookStackBookContents> {
    return this.request<BookStackBookContents>(`books/${id}`);
  }

  async getChapter(id: number): Promise<BookStackChapter> {
    return this.request<BookStackChapter>(`chapters/${id}`);
  }

  async getPage(id: number): Promise<BookStackPage> {
    return this.request<BookStackPage>(`pages/${id}`);
  }

  async getPageExportHtml(id: number): Promise<string> {
    await this.rateLimit();

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await requestUrl({
          url: `${this.baseUrl}/api/pages/${id}/export/html`,
          method: 'GET',
          headers: {
            Authorization: `Token ${this.tokenId}:${this.tokenSecret}`,
          },
          throw: false,
        });

        if (response.status === 429 && attempt < MAX_RETRIES) {
          const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }
        if (response.status === 401) {
          throw new BookStackAuthError('Authentication failed. Check your API token.');
        }
        if (response.status === 404) {
          throw new BookStackNotFoundError(`Page not found: ${id}`);
        }
        if (response.status >= 400) {
          throw new BookStackApiError(`HTTP ${response.status}`, response.status);
        }
        return response.text;
      } catch (error) {
        if (
          error instanceof BookStackAuthError ||
          error instanceof BookStackNotFoundError ||
          error instanceof BookStackApiError
        ) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES) {
          await this.sleep(BASE_RETRY_DELAY * Math.pow(2, attempt));
          continue;
        }
      }
    }
    throw lastError ?? new Error('Request failed after retries');
  }

  async createPage(data: {
    book_id: number;
    chapter_id?: number;
    name: string;
    html: string;
  }): Promise<BookStackPage> {
    return this.request<BookStackPage>('pages', 'POST', data);
  }

  async updatePage(
    id: number,
    data: { name?: string; html?: string },
  ): Promise<BookStackPage> {
    return this.request<BookStackPage>(`pages/${id}`, 'PUT', data);
  }

  async deletePage(id: number): Promise<void> {
    await this.request<void>(`pages/${id}`, 'DELETE');
  }

  async getImage(id: number): Promise<BookStackImage> {
    return this.request<BookStackImage>(`image-gallery/${id}`);
  }

  async getImagesForPage(pageId: number): Promise<BookStackListResponse<BookStackImage>> {
    return this.request<BookStackListResponse<BookStackImage>>(
      `image-gallery?filter[uploaded_to]=${pageId}&count=500`,
    );
  }

  /**
   * Upload an image to the BookStack image gallery via multipart/form-data.
   * Manually constructs the multipart body since Obsidian doesn't have FormData.
   */
  async uploadImage(
    pageId: number,
    name: string,
    imageData: ArrayBuffer,
  ): Promise<BookStackImage> {
    await this.rateLimit();

    // Sanitize filename for multipart header safety
    const safeName = name
      .replace(/["\r\n]/g, '')  // Remove chars that break multipart headers
      .replace(/[^\x20-\x7E]/g, '_');  // Replace non-ASCII with underscore

    const boundary = '----BookBridge' + Date.now();
    const encoder = new TextEncoder();

    const textFields: Array<{ name: string; value: string }> = [
      { name: 'uploaded_to', value: String(pageId) },
      { name: 'type', value: 'gallery' },
      { name: 'name', value: safeName },
    ];

    const parts: Uint8Array[] = [];

    // Add text fields
    for (const field of textFields) {
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`;
      parts.push(encoder.encode(header));
    }

    // Add binary image field
    const mimeType = guessMimeType(safeName);
    const imageHeader = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${safeName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
    parts.push(encoder.encode(imageHeader));
    parts.push(new Uint8Array(imageData));
    parts.push(encoder.encode('\r\n'));

    // Close boundary
    parts.push(encoder.encode(`--${boundary}--\r\n`));

    // Concatenate all parts
    const totalLength = parts.reduce((sum, p) => sum + p.byteLength, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.byteLength;
    }

    const response = await requestUrl({
      url: `${this.baseUrl}/api/image-gallery`,
      method: 'POST',
      headers: {
        Authorization: `Token ${this.tokenId}:${this.tokenSecret}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body.buffer,
      throw: false,
    });

    if (response.status === 401) {
      throw new BookStackAuthError('Authentication failed. Check your API token.');
    }
    if (response.status >= 400) {
      const message = response.json?.error?.message ?? `HTTP ${response.status}`;
      throw new BookStackApiError(message, response.status);
    }

    return response.json as BookStackImage;
  }

  async getAttachmentsForPage(pageId: number): Promise<BookStackListResponse<BookStackAttachment>> {
    return this.request<BookStackListResponse<BookStackAttachment>>(
      `attachments?filter[uploaded_to]=${pageId}`,
    );
  }

  async getAttachment(id: number): Promise<BookStackAttachmentDetail> {
    return this.request<BookStackAttachmentDetail>(`attachments/${id}`);
  }

}

export class BookStackApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'BookStackApiError';
  }
}

export class BookStackAuthError extends BookStackApiError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'BookStackAuthError';
  }
}

export class BookStackNotFoundError extends BookStackApiError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'BookStackNotFoundError';
  }
}

/** Guess MIME type from filename extension for image uploads. */
function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
  };
  return mimeTypes[ext] ?? 'application/octet-stream';
}
