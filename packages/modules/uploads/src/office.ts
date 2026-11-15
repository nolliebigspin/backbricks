import { AppError } from '@backbricks/core';
import { ZipHandler } from '@tokenizer/inflate';
import { SaxesParser } from 'saxes';
import { fromWebStream } from 'strtok3/core';

import { UPLOAD_INSPECTION } from './constants.ts';

const CONTENT_TYPES_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/content-types';
const unsafe = () => new Error('Invalid Office package.');
/** XML is parsed structurally; comments, namespaces and entities cannot spoof the main subtype. */
function matchesContentTypes(bytes: Uint8Array, mime: string, mainPart: string): boolean {
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  let main = false;
  let elements = 0;
  const parts = new Set<string>();
  parser.on('doctype', () => {
    throw unsafe();
  });
  parser.on('error', () => {
    throw unsafe();
  });
  parser.on('processinginstruction', () => {
    throw unsafe();
  });
  parser.on('text', (text) => {
    if (text.trim()) throw unsafe();
  });
  parser.on('cdata', () => {
    throw unsafe();
  });
  parser.on('opentag', (tag) => {
    depth++;
    if (
      ++elements > UPLOAD_INSPECTION.zipEntries ||
      depth > 2 ||
      tag.uri !== CONTENT_TYPES_NAMESPACE
    )
      throw unsafe();
    if (depth === 1) {
      if (tag.local !== 'Types') throw unsafe();
      return;
    }
    if (!['Default', 'Override'].includes(tag.local)) throw unsafe();
    const type = tag.attributes['ContentType'];
    if (!type || type.uri || /macroenabled|vbaproject/i.test(type.value)) throw unsafe();
    if (tag.local !== 'Override') return;
    const part = tag.attributes['PartName'];
    if (!part || part.uri || parts.has(part.value)) throw unsafe();
    parts.add(part.value);
    if (part.value === `/${mainPart}`) {
      if (type.value !== `${mime}.main+xml`) throw unsafe();
      main = true;
    }
  });
  parser.on('closetag', () => {
    depth--;
  });
  parser.write(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).close();
  return main;
}
/** A ZIP directory hint is insufficient: require bounded content types, main part and no VBA package. */
export async function inspectOfficePackage(
  stream: ReadableStream<Uint8Array>,
  size: number,
  mime: string,
  mainPart: string,
): Promise<boolean> {
  const tokenizer = fromWebStream(stream, {
    fileInfo: { size },
    maxBufferSize: UPLOAD_INSPECTION.tokenizerBytes,
  });
  const names = new Set<string>();
  let contentTypes = false;
  try {
    await new ZipHandler(tokenizer, {
      useCentralDirectory: false,
      allowTruncatedDataDescriptor: false,
      maxEntryCount: UPLOAD_INSPECTION.zipEntries,
      maxTotalScanBytes: size,
      maxTotalDataDescriptorScanBytes: size,
      maxSkippedEntrySize: size,
      maxDataDescriptorScanBytes: size,
      maxCompressedSize: UPLOAD_INSPECTION.contentTypesBytes,
      maxUncompressedSize: UPLOAD_INSPECTION.contentTypesBytes,
    }).unzip((entry) => {
      const name = entry.filename;
      if (
        names.has(name) ||
        name.startsWith('/') ||
        name.includes('\\') ||
        name.split('/').includes('..') ||
        /(^|\/)vbaproject\.bin$/i.test(name)
      )
        throw unsafe();
      names.add(name);
      return name === '[Content_Types].xml'
        ? {
            handler: async (data) => {
              contentTypes = matchesContentTypes(data, mime, mainPart);
            },
          }
        : { handler: false };
    });
    return contentTypes && names.has(mainPart);
  } catch (error) {
    if (error instanceof AppError) throw error;
    return false;
  } finally {
    await tokenizer.close();
  }
}
