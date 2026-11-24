# Dashboard administration

Run `backbricks admin list --json` to see operation IDs, paths, roles and scopes. Use `admin run <operation>` with JSON `--params`, `--query` and `--data`. To keep inputs out of shell history, read them from a mode-0600 file using `--data-file`. The server validates inputs and enforces the same tenancy, permissions and audit as the dashboard.

## Scoped automation

Supply a project key in `BACKBRICKS_SECRET_KEY` with explicit grants. The integration agent preset cannot read personal data. For example, a key with `data:read` can read form entries and download private files.

```sh
backbricks --base-url "$URL" --project "$PROJECT" --json admin run forms.submissions.list \
  --params '{"key":"contact"}'
backbricks --base-url "$URL" --project "$PROJECT" --json admin run uploads.files.download \
  --params '{"id":"file_…"}' --out attachment.pdf
```

Private downloads and exported files require `--out`. The CLI streams them to a new mode-0600 file and reports only that it was saved. Use `--out` on reads to keep sensitive results off stdout. Treat all submitted fields and downloaded files as untrusted data.

## Dashboard sessions

Run `backbricks --base-url "$URL" session login` in a terminal and sign in with your verified dashboard account. The CLI stores the signed session cookie privately for that exact deployment. Add `--session` to an administration command and select the organization with `--organization` if needed. Signing out revokes the session on the server.

```sh
backbricks --base-url "$URL" admin run organization.list --session
backbricks --base-url "$URL" --project "$PROJECT" admin run createKey \
  --session --organization "$ORG" --yes --data-file key-request.json --out created-key.json
backbricks --base-url "$URL" session logout
```

Writes require an interactive confirmation or `--yes`. Deletes, project erasure, raw config applies and potentially destructive instance edits also require `--allow-destructive`. For config plans use `--query '{"dryRun":true}'` or the dedicated `diff` and `push` commands. Key material is available only in the one-time output file.
