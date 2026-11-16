# ADR-0067: Configuration availability applies to writes

Status: accepted during P3.5b execution; maintainer review deferred to M3 completion.

Disabling an optional module must not make historical configuration or entry metadata unreadable (I19). Forms previously put provider availability into its stored-shape schema, so disabling uploads rejected reads of existing file fields.

`ModuleDefinition.validateConfigWrite` is an optional pure callback after shape validation. Defaults, templates and `parseConfig` use it. Historical reads and migrations validate the stored shape only. Instance creation and changed configuration, rollback and migration persistence validate writes; configuration plans validate new or changed configurations too. Unchanged configurations and name-only edits remain usable. No unavailable capability is granted by reading old configuration.

Server composition derives Forms file-field availability from the selected `files` provider. Forms-only deployments reject new file configurations with the existing path-bearing `capability_unavailable` problem, and still read historical entries. Submission claiming continues to require the actual transaction-bound capability.

The schemas and validators in code remain authoritative; no invariant changes.
