import { Button, ConfirmDialog, KeyRevealDialog } from '@backbricks/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../auth/client.ts';
import { accountError } from '../auth/navigation.ts';
import { canManage, tenantHeaders, useTenant } from './context.tsx';
import { Feedback, unwrap, useAction } from './feedback.tsx';
import { KeyForm } from './key-form.tsx';
import { useProject } from './project-shell.tsx';

export function EmbedPage() {
  const { t } = useTranslation();
  const { organizationId, role } = useTenant();
  const project = useProject();
  const integration = useQuery({
    queryKey: ['tenant', organizationId, project.id, 'integration'],
    queryFn: async ({ signal }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/integration', {
          params: { path: { projectId: project.id } },
          headers: tenantHeaders(organizationId),
          signal,
        }),
      ),
  });
  return (
    <div className="space-y-7">
      <h1 className="text-2xl font-semibold">{t('dashboard.embed')}</h1>
      <p>{t('keys.guidance')}</p>
      <p>
        {project.allowedOrigins.length
          ? project.allowedOrigins.join(', ')
          : t('projects.allDomains')}{' '}
        <a className="underline" href={`/projects/${project.id}/settings`}>
          {t('dashboard.settings')}
        </a>
      </p>
      {integration.isError && <Feedback error={accountError(integration.error)} />}
      {integration.data && (
        <dl className="space-y-2 rounded-lg border bg-background p-5 text-sm">
          <dt className="font-medium">{t('keys.baseUrl')}</dt>
          <dd className="break-all font-mono">{integration.data.baseUrl}</dd>
          <dt className="font-medium">{t('keys.publishable')}</dt>
          <dd className="break-all font-mono">
            {integration.data.publicKey ?? t('keys.noPublicKey')}
          </dd>
        </dl>
      )}
      {canManage(role) ? <KeyManagement /> : <p>{t('keys.noPermission')}</p>}
    </div>
  );
}

function KeyManagement() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useTenant();
  const { id: projectId } = useProject();
  const client = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const action = useAction();
  const keyPrefix = ['tenant', organizationId, projectId, 'keys'];
  const keys = useInfiniteQuery({
    queryKey: keyPrefix,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) =>
      unwrap(
        await admin.GET('/v1/projects/{projectId}/keys', {
          params: {
            path: { projectId },
            query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) },
          },
          headers: tenantHeaders(organizationId),
          signal,
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: keyPrefix }),
      client.invalidateQueries({ queryKey: ['tenant', organizationId, projectId, 'integration'] }),
    ]);
  }
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold">{t('keys.title')}</h2>
      {keys.isPending ? (
        <output>{t('common.loading')}</output>
      ) : keys.isError ? (
        <Feedback error={accountError(keys.error)} />
      ) : (
        <ul className="divide-y rounded-lg border bg-background">
          {keys.data.pages
            .flatMap((page) => page.data)
            .map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium">{key.name}</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {`${key.displayPrefix}…`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t(key.kind === 'secret' ? 'keys.secret' : 'keys.publishable')} ·{' '}
                    {key.revokedAt ? t('keys.revoked') : t('keys.active')} ·{' '}
                    {key.expiresAt
                      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                          new Date(key.expiresAt),
                        )
                      : t('keys.noExpiry')}
                  </p>
                </div>
                {!key.revokedAt && (
                  <Button
                    variant="outline"
                    disabled={action.busy}
                    onClick={() => setRevokeId(key.id)}
                  >
                    {t('keys.revoke')}
                  </Button>
                )}
              </li>
            ))}
        </ul>
      )}
      {keys.hasNextPage && (
        <Button
          variant="outline"
          onClick={() => {
            void keys.fetchNextPage();
          }}
          disabled={keys.isFetchingNextPage}
        >
          {t('common.more')}
        </Button>
      )}
      <Feedback error={action.error} />
      <details className="rounded-lg border bg-background p-5">
        <summary className="cursor-pointer font-medium">{t('keys.create')}</summary>
        <div className="mt-5">
          <KeyForm
            create={async (body) => {
              setToken(null);
              const created = unwrap(
                await admin.POST('/v1/projects/{projectId}/keys', {
                  params: { path: { projectId } },
                  headers: tenantHeaders(organizationId),
                  body,
                }),
              );
              setToken(created.token);
              await refresh();
            }}
          />
        </div>
      </details>
      {token && (
        <KeyRevealDialog
          token={token}
          title={t('keys.revealTitle')}
          description={t('keys.revealDescription')}
          copyLabel={t('common.copy')}
          closeLabel={t('common.close')}
          copiedLabel={t('common.copied')}
          copyErrorLabel={t('common.copyError')}
          onClose={() => setToken(null)}
        />
      )}
      {revokeId && (
        <ConfirmDialog
          title={t('keys.revokeTitle')}
          description={t('keys.revokeDescription')}
          confirmLabel={t('keys.revoke')}
          cancelLabel={t('common.cancel')}
          onClose={() => setRevokeId(null)}
          onConfirm={() => {
            const keyId = revokeId;
            setRevokeId(null);
            action.run(async () => {
              const result = await admin.DELETE('/v1/projects/{projectId}/keys/{keyId}', {
                params: { path: { projectId, keyId } },
                headers: tenantHeaders(organizationId),
              });
              if (!result.response.ok) throw result.error;
              await refresh();
            });
          }}
        />
      )}
    </section>
  );
}
