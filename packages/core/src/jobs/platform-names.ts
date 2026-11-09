export const PLATFORM_JOBS = {
  notificationDispatch: 'core.notifications.dispatch',
  notificationDelivery: 'core.notifications.deliver',
  notificationDigest: 'core.notifications.digest',
  instanceMigration: 'core.instances.migrate',
  retentionPurge: 'core.retention.purge',
  subjectErasure: 'core.privacy.erase',
  maintenanceFanout: 'core.maintenance.fanout',
  projectMaintenance: 'core.maintenance.project',
} as const;
