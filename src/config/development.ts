import { AppConfig } from './types';
import { defaultConfig } from './default';

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