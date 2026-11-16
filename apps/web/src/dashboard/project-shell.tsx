import { useQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { ChoiceField } from '../auth/fields.tsx';
import { accountError } from '../auth/navigation.ts';
import { moduleNavigation } from '../modules/registry.ts';
import { useTenant } from './context.tsx';
import { Feedback } from './feedback.tsx';
import { NavLink, NavSection } from './nav-link.tsx';
import { useOperationalModules } from './operational-modules.ts';
import { readProject, useProjects, type Project } from './projects.ts';

/** Exported for component tests; pages read the project through {@link useProject}. */
export const ProjectContext = createContext<Project | null>(null);
export function useProject() {
  const project = useContext(ProjectContext);
  if (!project) throw new Error('Missing dashboard project');
  return project;
}

/** One cache entry per tenant project, shared by the sidebar and the project pages. */
function useProjectQuery(projectId: string) {
  const { organizationId } = useTenant();
  return useQuery({
    queryKey: ['tenant', organizationId, 'project', projectId],
    queryFn: ({ signal }) => readProject(organizationId, projectId, signal),
  });
}

export function ProjectShell({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const project = useProjectQuery(projectId);
  if (project.isPending) return <output>{t('common.loading')}</output>;
  if (project.isError) return <Feedback error={accountError(project.error)} />;
  return (
    <ProjectContext value={project.data}>
      <Outlet />
    </ProjectContext>
  );
}

/** Project picker and the project's pages, rendered in the dashboard sidebar. */
export function ProjectNavigation({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const projects = useProjects();
  const project = useProjectQuery(projectId);
  const modules = useOperationalModules();
  const options = projects.data?.pages.flatMap((page) => page.data) ?? [];
  const base = `/projects/${projectId}`;
  return (
    <div className="space-y-3">
      <div className="px-2">
        <ChoiceField
          label={t('dashboard.project')}
          value={projectId}
          onChange={(e) => window.location.assign(`/projects/${e.target.value}`)}
          className="w-full"
        >
          {!options.some((item) => item.id === projectId) && (
            <option value={projectId}>{project.data?.name ?? projectId}</option>
          )}
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </ChoiceField>
      </div>
      <NavSection label={t('dashboard.projectNavigation')}>
        <NavLink href={base} exact>
          {t('dashboard.overview')}
        </NavLink>
        {moduleNavigation(projectId, modules.data ?? []).map((item) => (
          <NavLink key={item.type} href={item.href}>
            {t(item.labelKey)}
          </NavLink>
        ))}
        <NavLink href={`${base}/embed`}>{t('dashboard.embed')}</NavLink>
        <NavLink href={`${base}/settings`}>{t('dashboard.settings')}</NavLink>
      </NavSection>
    </div>
  );
}
