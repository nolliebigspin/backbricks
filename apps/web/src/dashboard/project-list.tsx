import { Button } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

import { admin } from '../auth/client.ts';
import { accountError } from '../auth/navigation.ts';
import { canManage, tenantHeaders, useTenant } from './context.tsx';
import { Feedback, unwrap } from './feedback.tsx';
import { ProjectForm } from './project-form.tsx';
import { useProjects } from './projects.ts';

export function ProjectList() {
  const { t } = useTranslation();
  const { organizationId, role } = useTenant();
  const projects = useProjects();
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('dashboard.projects')}</h1>
      {projects.isPending ? (
        <output>{t('common.loading')}</output>
      ) : projects.isError ? (
        <Feedback error={accountError(projects.error)} />
      ) : (
        <ul className="divide-y rounded-lg border bg-background">
          {projects.data.pages
            .flatMap((page) => page.data)
            .map((project) => (
              <li key={project.id}>
                <a className="block px-5 py-4 hover:bg-muted" href={`/projects/${project.id}`}>
                  {project.name}
                  <span className="ml-3 text-sm text-muted-foreground">{project.slug}</span>
                </a>
              </li>
            ))}
        </ul>
      )}
      {projects.data?.pages[0]?.data.length === 0 && <p>{t('projects.empty')}</p>}
      {projects.hasNextPage && (
        <Button
          variant="outline"
          disabled={projects.isFetchingNextPage}
          onClick={() => {
            void projects.fetchNextPage();
          }}
        >
          {t('common.more')}
        </Button>
      )}
      {canManage(role) && (
        <details className="rounded-lg border bg-background p-5">
          <summary className="cursor-pointer font-medium">{t('projects.create')}</summary>
          <div className="mt-5">
            <ProjectForm
              save={async (body) => {
                const project = unwrap(
                  await admin.POST('/v1/projects', {
                    body,
                    headers: tenantHeaders(organizationId),
                  }),
                );
                window.location.assign(`/projects/${project.id}`);
              }}
            />
          </div>
        </details>
      )}
    </section>
  );
}
