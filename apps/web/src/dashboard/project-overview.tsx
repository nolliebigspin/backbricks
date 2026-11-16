import { PageHeader } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { moduleNavigation } from '../modules/registry.ts';
import { useOperationalModules } from './operational-modules.ts';
import { useProject } from './project-shell.tsx';

/** The project's front door: one link per section, each saying in a sentence what it holds. */
export function ProjectOverview() {
  const { t } = useTranslation();
  const project = useProject();
  const modules = useOperationalModules();
  const base = `/projects/${project.id}`;
  const sections = [
    ...moduleNavigation(project.id, modules.data ?? []).map((item) => ({
      href: item.href,
      label: t(item.labelKey),
      summary: t(item.summaryKey),
    })),
    {
      href: `${base}/embed`,
      label: t('dashboard.embed'),
      summary: t('dashboard.embedDescription'),
    },
    {
      href: `${base}/settings`,
      label: t('dashboard.settings'),
      summary: t('dashboard.settingsDescription'),
    },
  ];
  return (
    <div className="space-y-10">
      <PageHeader title={project.name} description={t('projects.overview')} />
      {modules.data?.length === 0 && <p>{t('projects.noModules')}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <li key={section.href}>
            <a
              href={section.href}
              className="flex h-full flex-col gap-1.5 rounded-lg border bg-card p-5 transition-colors hover:border-foreground/25 hover:bg-muted/50"
            >
              <span className="flex items-center gap-2.5 font-heading text-lg font-semibold">
                <span aria-hidden="true" className="h-2 w-4 rounded-xs border-2 border-brand" />
                {section.label}
              </span>
              <span className="text-sm text-pretty text-muted-foreground">{section.summary}</span>
            </a>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t pt-6 text-sm">
        <dt className="font-medium">{t('projects.domains')}</dt>
        <dd className="text-muted-foreground">
          {project.allowedOrigins.join(', ') || t('projects.allDomains')}
        </dd>
      </dl>
    </div>
  );
}
