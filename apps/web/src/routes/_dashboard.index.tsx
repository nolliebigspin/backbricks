import { createFileRoute } from '@tanstack/react-router';

import { ProjectList } from '../dashboard/project-list.tsx';
export const Route = createFileRoute('/_dashboard/')({ component: ProjectList });
