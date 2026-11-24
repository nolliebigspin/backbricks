// SPDX-License-Identifier: AGPL-3.0-only

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import {
  FILE_SIZE_LIMITS,
  inlineImageTypeSchema,
  storageContentDisposition,
  type Clock,
  type StorageAdapter,
} from '@backbricks/core';
import { z } from 'zod';

export const storageTransferPath = '/_backbricks/storage';
const transferLifetimeMs = 120_000;
const maxTransferBytes = FILE_SIZE_LIMITS.maxSizeMb * FILE_SIZE_LIMITS.bytesPerMb;
const maxTicketLength = 8_192;

const ticketSchema = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('GET'),
      url: z.url(),
      expiresAt: z.number(),
      imageType: inlineImageTypeSchema.optional(),
      downloadName: z.string().max(255).optional(),
    })
    .strict(),
  z
    .object({
      method: z.literal('PUT'),
      url: z.url(),
      expiresAt: z.number(),
      length: z.number().int().positive().max(maxTransferBytes),
      type: z.string().max(255),
    })
    .strict(),
]);
type Ticket = z.infer<typeof ticketSchema>;

const cors: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

function checkedBody(body: ReadableStream<Uint8Array>, length: number) {
  let size = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > length) throw new Error('Transfer exceeds declared length.');
        controller.enqueue(chunk);
      },
      flush() {
        if (size !== length) throw new Error('Transfer did not match declared length.');
      },
    }),
  );
}

/** Proxy only URLs already signed by the selected private provider, preserving copy-before-scan. */
export function createStorageProxy(
  publicUrl: string,
  internalUrl: string,
  secret: string,
  clock: Clock,
) {
  const provider = new URL(internalUrl);
  const key = createHash('sha256').update('backbricks/storage-proxy/v1\0').update(secret).digest();

  function route(input: Ticket) {
    const ticket = ticketSchema.parse(input);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(ticket)), cipher.final()]);
    const url = new URL(storageTransferPath, publicUrl);
    url.searchParams.set(
      'ticket',
      Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url'),
    );
    return url.href;
  }

  function read(raw: string | null) {
    if (!raw || raw.length > maxTicketLength || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
    const bytes = Buffer.from(raw, 'base64url');
    try {
      const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      const decoded = Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
      const ticket = ticketSchema.parse(JSON.parse(decoded.toString()));
      const url = new URL(ticket.url);
      if (
        url.origin !== provider.origin ||
        !url.pathname.startsWith(provider.pathname.replace(/\/$/, '') + '/')
      )
        return null;
      return { ticket, url };
    } catch {
      return null;
    }
  }

  async function handle(request: Request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const authorized = read(new URL(request.url).searchParams.get('ticket'));
    const start = clock.now().getTime();
    if (
      !authorized ||
      authorized.ticket.expiresAt <= start ||
      authorized.ticket.method !== request.method
    )
      return new Response(null, { status: 404, headers: cors });
    const { ticket, url } = authorized;
    const headers = new Headers();
    let body: ReadableStream<Uint8Array> | undefined;
    if (ticket.method === 'PUT') {
      if (
        !request.body ||
        request.headers.get('content-length') !== String(ticket.length) ||
        request.headers.get('content-type') !== ticket.type
      )
        return new Response(null, { status: 400, headers: cors });
      headers.set('content-length', String(ticket.length));
      headers.set('content-type', ticket.type);
      body = checkedBody(request.body, ticket.length);
    }
    try {
      const upstream = await fetch(url, {
        method: ticket.method,
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.any([
          request.signal,
          AbortSignal.timeout(Math.min(transferLifetimeMs, ticket.expiresAt - start)),
        ]),
      });
      if (ticket.method === 'PUT' || !upstream.ok) {
        await upstream.body?.cancel();
        return new Response(null, {
          status: upstream.ok ? 204 : upstream.status === 404 ? 404 : 502,
          headers: cors,
        });
      }
      const resultHeaders = new Headers(cors);
      const length = upstream.headers.get('content-length');
      if (length) resultHeaders.set('content-length', length);
      resultHeaders.set('content-type', ticket.imageType ?? 'application/octet-stream');
      resultHeaders.set(
        'content-disposition',
        storageContentDisposition(ticket.imageType !== undefined, ticket.downloadName),
      );
      return new Response(upstream.body, { status: 200, headers: resultHeaders });
    } catch {
      return new Response(null, { status: 502, headers: cors });
    }
  }

  return {
    handle,
    wrap(storage: StorageAdapter): StorageAdapter {
      return {
        ...storage,
        async createUploadSession(input) {
          const expiresAt = clock.now().getTime() + input.expiresInSeconds * 1000;
          const signed = await storage.createUploadSession(input);
          return {
            ...signed,
            url: route({
              method: 'PUT',
              url: signed.url,
              expiresAt,
              length: input.size,
              type: input.contentType,
            }),
          };
        },
        async presignGet(input) {
          const expiresAt = Math.min(
            clock.now().getTime() + input.expiresInSeconds * 1000,
            input.notAfter?.getTime() ?? Infinity,
          );
          const signed = await storage.presignGet(input);
          return route({
            method: 'GET',
            url: signed,
            expiresAt,
            imageType: input.inlineImageType,
            downloadName: input.downloadName,
          });
        },
      };
    },
  };
}
