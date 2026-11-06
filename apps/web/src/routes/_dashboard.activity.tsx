import { createFileRoute } from '@tanstack/react-router';

import { ActivityPage } from '../dashboard/activity.tsx';
export const Route = createFileRoute('/_dashboard/activity')({ component: ActivityPage });
