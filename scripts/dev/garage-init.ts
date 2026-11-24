#!/usr/bin/env bun
import { initGarage } from '@backbricks/adapters';

import { garageDevSettings } from './garage-settings.ts';

if (import.meta.main) {
  await initGarage(garageDevSettings(process.env));
  console.log('garage-init: development bucket ready');
}
