import { AppConfig } from './types.js';
import { defaultConfig } from './default.js';

export const developmentConfig: AppConfig = {
  ...defaultConfig,
  server: {
    ...defaultConfig.server,
    env: 'development',
  },
  logging: {
    ...defaultConfig.logging,
    level: 'debug',
  },
}; 