import { formsConfigSchema, type FormsConfig } from './config.ts';

type Language = 'en' | 'de';
type Copy = Readonly<Record<Language, string>>;
type TemplateField = Readonly<Record<string, unknown> & { label: Copy; help?: Copy }>;
type TemplateSource = Readonly<{
  name: Copy;
  fields: (files: boolean) => readonly TemplateField[];
}>;

const consentField: TemplateField = {
  key: 'privacy',
  type: 'consent',
  label: { en: 'Privacy', de: 'Datenschutz' },
  text: {
    en: 'I agree that my details are stored to answer my request.',
    de: 'Ich bin einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage gespeichert werden.',
  },
  version: '1',
};
const nameField: TemplateField = {
  key: 'name',
  type: 'text',
  label: { en: 'Name', de: 'Name' },
  required: true,
  maxLength: 200,
};
const emailField: TemplateField = {
  key: 'email',
  type: 'email',
  label: { en: 'Email', de: 'E-Mail' },
  required: true,
  identifiesSubject: true,
};
const phoneField: TemplateField = {
  key: 'phone',
  type: 'phone',
  label: { en: 'Phone', de: 'Telefon' },
};

/** One source per template; the en/de variants differ only in copy (§E.5 "templates instead of empty pages"). */
const SOURCES = {
  contact: {
    name: { en: 'Contact form', de: 'Kontaktformular' },
    fields: () => [
      nameField,
      emailField,
      {
        key: 'message',
        type: 'textarea',
        label: { en: 'Message', de: 'Nachricht' },
        required: true,
      },
      consentField,
    ],
  },
  'quote-request': {
    name: { en: 'Quote request', de: 'Angebotsanfrage' },
    fields: () => [
      nameField,
      emailField,
      { key: 'company', type: 'text', label: { en: 'Company', de: 'Firma' }, maxLength: 200 },
      phoneField,
      {
        key: 'service',
        type: 'select',
        label: { en: 'Service', de: 'Leistung' },
        required: true,
        options: [
          { value: 'consulting', label: { en: 'Consulting', de: 'Beratung' } },
          { value: 'project', label: { en: 'Project work', de: 'Projektarbeit' } },
          { value: 'other', label: { en: 'Other', de: 'Sonstiges' } },
        ],
      },
      {
        key: 'budget',
        type: 'number',
        label: { en: 'Budget (EUR)', de: 'Budget (EUR)' },
        min: 0,
      },
      {
        key: 'details',
        type: 'textarea',
        label: { en: 'Project details', de: 'Projektbeschreibung' },
        required: true,
      },
      consentField,
    ],
  },
  'event-signup': {
    name: { en: 'Event sign-up', de: 'Veranstaltungsanmeldung' },
    fields: () => [
      nameField,
      emailField,
      {
        key: 'guests',
        type: 'number',
        label: { en: 'Number of people', de: 'Anzahl Personen' },
        required: true,
        min: 1,
        max: 10,
      },
      {
        key: 'dietary',
        type: 'multiselect',
        label: { en: 'Dietary requirements', de: 'Ernährungswünsche' },
        options: [
          { value: 'vegetarian', label: { en: 'Vegetarian', de: 'Vegetarisch' } },
          { value: 'vegan', label: { en: 'Vegan', de: 'Vegan' } },
          { value: 'gluten-free', label: { en: 'Gluten-free', de: 'Glutenfrei' } },
        ],
      },
      {
        key: 'notes',
        type: 'textarea',
        label: { en: 'Notes', de: 'Anmerkungen' },
        maxLength: 2000,
      },
      consentField,
    ],
  },
  'job-application': {
    name: { en: 'Job application', de: 'Bewerbung' },
    fields: (files) => [
      nameField,
      emailField,
      phoneField,
      {
        key: 'position',
        type: 'text',
        label: { en: 'Position', de: 'Stelle' },
        required: true,
        maxLength: 200,
      },
      { key: 'start_date', type: 'date', label: { en: 'Earliest start', de: 'Frühester Beginn' } },
      {
        key: 'cover_letter',
        type: 'textarea',
        label: { en: 'Cover letter', de: 'Anschreiben' },
        maxLength: 10_000,
      },
      // Without uploads the CV becomes a link, so the template still works (§C.7).
      files
        ? {
            key: 'cv',
            type: 'file',
            label: { en: 'CV', de: 'Lebenslauf' },
            required: true,
            zone: 'cv',
            maxFiles: 1,
          }
        : {
            key: 'cv_link',
            type: 'url',
            label: { en: 'Link to your CV', de: 'Link zu Ihrem Lebenslauf' },
            help: {
              en: 'For example a cloud storage or LinkedIn link.',
              de: 'Zum Beispiel ein Cloud-Speicher- oder LinkedIn-Link.',
            },
          },
      consentField,
    ],
  },
} as const satisfies Record<string, TemplateSource>;
export type FormTemplateName = keyof typeof SOURCES;

function localize(source: TemplateSource, language: Language, files: boolean): FormsConfig {
  const pick = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(pick);
    if (value === null || typeof value !== 'object') return value;
    const entries = Object.entries(value);
    if (entries.length === 2 && 'en' in value && 'de' in value)
      return language === 'en' ? value.en : value.de;
    return Object.fromEntries(entries.map(([key, item]) => [key, pick(item)]));
  };
  return formsConfigSchema.parse({ fields: pick(source.fields(files)) });
}

/**
 * Template registry for the module definition. Keys are `<template>-<language>`; the job
 * application uses a `file` field only when the `files` capability (uploads) is present.
 */
export function formsTemplates(options: { files: boolean }) {
  const result: Record<string, { name: string; config: FormsConfig }> = {};
  for (const [key, source] of Object.entries(SOURCES))
    for (const language of ['en', 'de'] as const)
      result[`${key}-${language}`] = {
        name: source.name[language],
        config: localize(source, language, options.files),
      };
  return result;
}

/** A new form starts as the English contact form, so it works before the owner edits it. */
export function defaultFormsConfig(): FormsConfig {
  return localize(SOURCES.contact, 'en', false);
}
