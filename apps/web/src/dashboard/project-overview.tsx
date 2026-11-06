import { Badge } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { useProject } from './project-shell.tsx';
import { useOperationalModules } from './shell.tsx';

export function ProjectOverview() {
  const { t, i18n } = useTranslation();
  const project = useProject();
  const modules = useOperationalModules();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      <p className="text-muted-foreground">{t('projects.overview')}</p>
      <div className="flex flex-wrap gap-2">
        {modules.data?.map((module) => (
          <Badge key={module.type} variant="secondary">
            {i18n.language === 'de' ? module.displayName.de : module.displayName.en}
          </Badge>
        ))}
      </div>
      {modules.data?.length === 0 && <p>{t('projects.noModules')}</p>}
      <dl className="grid gap-2 text-sm">
        <dt className="font-medium">{t('projects.domains')}</dt>
        <dd>{project.allowedOrigins.join(', ') || t('projects.allDomains')}</dd>
      </dl>
    </div>
  );
}
