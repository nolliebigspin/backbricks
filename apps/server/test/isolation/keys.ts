import { issueKey } from '../platform-read-fixture.ts';
import type { IsolationFixture } from './setup.ts';
import type { KeyProbes } from './suite.ts';

/** Real session-issued secret keys for the key probes, minted once per project and scope. */
export function createKeyProbes(f: IsolationFixture): KeyProbes {
  const tokens = new Map<string, Promise<string>>();
  async function issue(projectId: string, scope: string) {
    const key = await issueKey(f, projectId, {
      kind: 'secret',
      name: 'Isolation probe',
      scopes: [scope],
      expiresAt: null,
    });
    // The first authentication records last use; doing it now keeps later denial snapshots stable.
    await f.request(`/v1/projects/${projectId}`, undefined, undefined, {
      authorization: `Bearer ${key.token}`,
    });
    return key.token;
  }
  return {
    projects: [f.a1, f.a2, f.b1, f.b2],
    token(projectId, scope) {
      const id = `${projectId} ${scope}`;
      const existing = tokens.get(id);
      if (existing) return existing;
      const created = issue(projectId, scope);
      tokens.set(id, created);
      return created;
    },
  };
}
