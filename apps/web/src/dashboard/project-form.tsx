import { Button, Label, Textarea } from '@backbricks/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, formText } from '../auth/fields.tsx';
import { Feedback, useAction } from './feedback.tsx';
import type { Project } from './projects.ts';

/** Shared create/settings fields; generated request calls validate the submitted contract. */
export function ProjectForm({
  project,
  save,
}: {
  project?: Project;
  save: (data: Pick<Project, 'name' | 'slug' | 'allowedOrigins'>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [origins, setOrigins] = useState(project?.allowedOrigins.join('\n') ?? '');
  const action = useAction();
  const id = useId();
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        action.run(async () =>
          save({
            name: formText(data, 'name'),
            slug: formText(data, 'slug'),
            allowedOrigins: origins
              .split('\n')
              .map((value) => value.trim())
              .filter(Boolean),
          }),
        );
      }}
    >
      <Field
        label={t('common.name')}
        name="name"
        defaultValue={project?.name}
        required
        maxLength={120}
      />
      <Field
        label={t('common.address')}
        name="slug"
        defaultValue={project?.slug}
        required
        maxLength={63}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
      />
      <p className="text-sm text-muted-foreground">{t('common.addressHint')}</p>
      <div className="space-y-2">
        <Label htmlFor={id}>{t('projects.domains')}</Label>
        <Textarea
          id={id}
          name="origins"
          rows={4}
          value={origins}
          onChange={(e) => setOrigins(e.target.value)}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {t('projects.domainsHint')}
        </p>
      </div>
      {!origins.trim() && (
        <label className="flex items-start gap-3 rounded-md border p-4 text-sm">
          <input name="allowAnyOrigin" type="checkbox" required className="mt-1" />
          {t('projects.anyOrigin')}
        </label>
      )}
      <Feedback
        error={action.error === 'common.invalid' ? 'projects.invalid' : action.error}
        done={action.done}
      />
      <Button type="submit" disabled={action.busy}>
        {t(action.busy ? 'common.working' : project ? 'common.save' : 'projects.create')}
      </Button>
    </form>
  );
}
