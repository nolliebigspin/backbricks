import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { admin } from '../auth/client.ts';
import { canManage, tenantHeaders, useTenant } from './context.tsx';
import { unwrap } from './feedback.tsx';
import { ProjectForm } from './project-form.tsx';
import { useProject } from './project-shell.tsx';

export function ProjectSettings() {
  const { t } = useTranslation();
  const project = useProject();
  const { organizationId, role } = useTenant();
  const client = useQueryClient();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t('dashboard.settings')}</h1>
      {canManage(role) ? (
        <ProjectForm
          project={project}
          save={async (body) => {
            unwrap(
              await admin.PATCH('/v1/projects/{projectId}', {
                body,
                params: { path: { projectId: project.id } },
                headers: tenantHeaders(organizationId),
              }),
            );
            await client.invalidateQueries({ queryKey: ['tenant', organizationId] });
          }}
        />
      ) : (
        <p>{t('dashboard.forbidden')}</p>
      )}
    </div>
  );
}
