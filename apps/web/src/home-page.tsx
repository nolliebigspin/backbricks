import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@backbricks/ui';
import { useTranslation } from 'react-i18next';

/** Placeholder until the dashboard shell (P1.12). */
export function HomePage() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('home.title')}</CardTitle>
        <CardDescription>{t('home.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant="secondary">{t('home.status')}</Badge>
      </CardContent>
    </Card>
  );
}
