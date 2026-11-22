import { configObject } from '../../dashboard/config-values.ts';

const example = (text: string, limit: unknown) =>
  typeof limit === 'number' ? text.slice(0, limit) : text;

export function reviewSubmitExample(collectionConfig: unknown) {
  const config = configObject(collectionConfig);
  const fields = Array.isArray(config['fields']) ? config['fields'] : [];
  const requiredFields = Object.fromEntries(
    fields.flatMap((value: unknown) => {
      const field = configObject(value);
      return field['required'] === true && typeof field['key'] === 'string'
        ? [[field['key'], 'Example']]
        : [];
    }),
  );
  return {
    rating: 1,
    authorName: 'Ada Lovelace',
    ...(config['titleRequired']
      ? { title: example('Helpful service', config['titleMaxLength']) }
      : {}),
    ...(config['bodyRequired']
      ? { body: example('Thank you for the help.', config['bodyMaxLength']) }
      : {}),
    ...(config['emailRequired'] ? { email: 'ada@example.com' } : {}),
    ...(Object.keys(requiredFields).length ? { fields: requiredFields } : {}),
  };
}
