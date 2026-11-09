import { useQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { ChoiceField } from '../auth/fields.tsx';
import { accountError } from '../auth/navigation.ts';
import { useTenant } from './context.tsx';
import { Feedback } from './feedback.tsx';
import { readProject, useProjects, type Project } from './projects.ts';

const ProjectContext = createContext<Project | null>(null);
export function useProject() {
  const project = useContext(ProjectContext);
  if (!project) throw new Error('Missing dashboard project');
  return project;
}
export function ProjectShell({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { organizationId } = useTenant();
  const projects = useProjects();
  const project = useQuery({
    queryKey: ['tenant', organizationId, 'project', projectId],
    queryFn: ({ signal }) => readProject(organizationId, projectId, signal),
  });
  if (project.isPending) return <output>{t('common.loading')}</output>;
  if (project.isError) return <Feedback error={accountError(project.error)} />;
  const options = projects.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <ProjectContext value={project.data}>
      <section className="space-y-6">
        <ChoiceField
          label={t('dashboard.project')}
          value={projectId}
          onChange={(e) => window.location.assign(`/projects/${e.target.value}`)}
        >
          {!options.some((item) => item.id === projectId) && (
            <option value={projectId}>{project.data.name}</option>
          )}
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </ChoiceField>
        <nav
          className="flex flex-wrap gap-5 border-b pb-4 text-sm"
          aria-label={t('dashboard.projectNavigation')}
        >
          <a href={`/projects/${projectId}`}>{t('dashboard.overview')}</a>
          <a href={`/projects/${projectId}/settings`}>{t('dashboard.settings')}</a>
          <a href={`/projects/${projectId}/embed`}>{t('dashboard.embed')}</a>
        </nav>
        <Outlet />
      </section>
    </ProjectContext>
  );
}
