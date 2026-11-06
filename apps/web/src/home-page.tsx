import { Button, Card, CardContent, CardHeader, CardTitle } from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { auth } from './auth/client.ts';

/** Session gate keeps protected content out of signed-out renders. */
export function HomePage() {
  const { t } = useTranslation();
  const session = auth.useSession();
  const queries = useQueryClient();
  useEffect(() => {
    if (!session.isPending && !session.data) window.location.replace('/login');
  }, [session.isPending, session.data]);
  if (!session.data) return <output>{t('common.loading')}</output>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('home.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          onClick={() => {
            void auth.signOut().then(() => {
              queries.clear();
              window.location.replace('/login');
              return undefined;
            });
          }}
        >
          {t('common.signOut')}
        </Button>
      </CardContent>
    </Card>
  );
}
