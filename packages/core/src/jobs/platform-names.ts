export const PLATFORM_JOBS = {
  instanceMigration: 'core.instances.migrate',
  retentionPurge: 'core.retention.purge',
  subjectErasure: 'core.privacy.erase',
  maintenanceFanout: 'core.maintenance.fanout',
  projectMaintenance: 'core.maintenance.project',
} as const;
