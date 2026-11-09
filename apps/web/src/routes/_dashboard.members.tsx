import { createFileRoute } from '@tanstack/react-router';

import { MembersPage } from '../dashboard/members.tsx';
export const Route = createFileRoute('/_dashboard/members')({ component: MembersPage });
