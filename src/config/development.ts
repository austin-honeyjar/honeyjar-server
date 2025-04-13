import { AppConfig } from './types.js';
import { defaultConfig } from './default.js';

export const developmentConfig: AppConfig = {
  ...defaultConfig,
  server: {
    ...defaultConfig.server,
    env: 'devlocal',
  },
  logging: {
    ...defaultConfig.logging,
    level: 'debug',
  },
}; 