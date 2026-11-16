/**
 * Shared SDK declaration envelope. `valueType` must be generated TypeScript from trusted module
 * code, never owner text; resource/key names are JSON-quoted to keep them inside a property name.
 */
export function sdkSchemaDeclaration(resource: string, key: string, valueType: string): string {
  return [
    `declare module '@backbricks/sdk' {`,
    `  interface BackbricksSchema {`,
    `    ${JSON.stringify(`${resource}/${key}`)}: ${valueType};`,
    `  }`,
    `}`,
    `export {};`,
  ].join('\n');
}
