/** Template keys follow `<template>-<language>` (P2.1b); show the current language's set. */
export function templatesFor(
  templates: readonly { key: string; name: string }[],
  language: string,
) {
  const local = templates.filter((template) => template.key.endsWith(`-${language}`));
  return local.length > 0 ? local : templates;
}
