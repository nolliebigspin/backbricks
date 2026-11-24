// SPDX-License-Identifier: AGPL-3.0-only

/** Format a download header without using a user filename as the fallback. */
export function storageContentDisposition(inline: boolean, name = 'download') {
  const encoded = encodeURIComponent(name).replaceAll(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encoded}`;
}
