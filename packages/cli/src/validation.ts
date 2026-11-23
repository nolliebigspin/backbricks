import addFormats from 'ajv-formats';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';

import { CliError, exit, safeLabel } from './errors.ts';
import schema from './generated/config-schema.json' with { type: 'json' };
import type { ConfigInput } from './management.ts';

let validate: ValidateFunction<ConfigInput> | undefined;
const instanceKey = schema.properties.modules.properties.forms.propertyNames;
const instanceKeyPattern = new RegExp(instanceKey.pattern);

export function validInstanceKey(value: string) {
  return (
    value.length >= instanceKey.minLength &&
    value.length <= instanceKey.maxLength &&
    instanceKeyPattern.test(value)
  );
}

export function validateConfig(value: unknown): ConfigInput {
  if (!validate) {
    const ajv = new Ajv2020({ strictSchema: true, strictTypes: false, allErrors: true });
    addFormats(ajv, ['date']);
    validate = ajv.compile<ConfigInput>(schema);
  }
  if (!validate(value)) {
    const fields = validate.errors?.map(({ instancePath, keyword }) => ({
      path: safeLabel(instancePath) ?? '/',
      code: keyword,
    }));
    throw new CliError(
      'invalid_config',
      'The configuration does not match the v1 schema.',
      exit.usage,
      { fields },
    );
  }
  return value;
}
