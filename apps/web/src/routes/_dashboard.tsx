import { createFileRoute } from '@tanstack/react-router';

import { DashboardShell } from '../dashboard/shell.tsx';
export const Route = createFileRoute('/_dashboard')({ component: DashboardShell });
