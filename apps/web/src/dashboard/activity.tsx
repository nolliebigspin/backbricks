import { Button } from '@backbricks/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { admin } from '../auth/client.ts';
import { accountError } from '../auth/navigation.ts';
import { canManage, tenantHeaders, useTenant } from './context.tsx';
import { Feedback, unwrap } from './feedback.tsx';

/** Presentation keys only; structural actions remain owned by the server's event catalog. */
const actionLabels: Readonly<Record<string, string>> = {
  'organization.created': 'organizationCreated',
  'project.created': 'projectCreated',
  'project.updated': 'projectUpdated',
  'project.archived': 'projectArchived',
  'key.created': 'keyCreated',
  'key.revoked': 'keyRevoked',
  'security.secret_key_exposed': 'secretExposed',
  'invitation.created': 'invitationCreated',
  'invitation.resent': 'invitationResent',
  'invitation.canceled': 'invitationCanceled',
  'membership.created': 'memberJoined',
  'membership.removed': 'memberRemoved',
  'membership.role_changed': 'roleChanged',
  'instance.created': 'featureCreated',
  'instance.updated': 'featureUpdated',
  'instance.archived': 'featureArchived',
  'instance.rolled_back': 'featureUpdated',
  'instance.migrated': 'featureUpdated',
};

export function ActivityPage() {
  const { t } = useTranslation();
  const { role } = useTenant();
  return canManage(role) ? (
    <OrganizationActivity />
  ) : (
    <p role="alert">{t('dashboard.forbidden')}</p>
  );
}
function OrganizationActivity() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useTenant();
  const activity = useInfiniteQuery({
    queryKey: ['tenant', organizationId, 'activity'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) =>
      unwrap(
        await admin.GET('/v1/organizations/{organizationId}/audit-logs', {
          headers: tenantHeaders(organizationId),
          params: {
            path: { organizationId },
            query: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
          },
          signal,
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">{t('dashboard.activity')}</h1>
      <p className="text-sm text-muted-foreground">{t('activity.description')}</p>
      {activity.isPending ? (
        <output>{t('common.loading')}</output>
      ) : activity.isError ? (
        <Feedback error={accountError(activity.error)} />
      ) : (
        <ol className="divide-y rounded-lg border bg-background">
          {activity.data.pages
            .flatMap((page) => page.data)
            .map((entry) => (
              <li key={entry.id} className="space-y-2 p-5">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">
                    {t(`activity.actions.${actionLabels[entry.action] ?? 'generic'}`)}
                  </p>
                  <time dateTime={entry.createdAt} className="text-sm text-muted-foreground">
                    {new Intl.DateTimeFormat(i18n.language, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(entry.createdAt))}
                  </time>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(`activity.actor.${entry.actorType}`)}
                </p>
                {entry.changes?.previousRole && entry.changes.role && (
                  <p className="text-sm">
                    {t(`roles.${entry.changes.previousRole}`)} → {t(`roles.${entry.changes.role}`)}
                  </p>
                )}
              </li>
            ))}
        </ol>
      )}
      {activity.data?.pages[0]?.data.length === 0 && <p>{t('activity.empty')}</p>}
      {activity.hasNextPage && (
        <Button
          variant="outline"
          disabled={activity.isFetchingNextPage}
          onClick={() => {
            void activity.fetchNextPage();
          }}
        >
          {t('common.more')}
        </Button>
      )}
    </section>
  );
}
