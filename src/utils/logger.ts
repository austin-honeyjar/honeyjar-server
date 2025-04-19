import winston from 'winston';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

// Create log directory if it doesn't exist
const logDir = join(process.cwd(), 'logs');

// Configure Winston
const logger = winston.createLogger({
  level: 'debug', // Always use debug level to see all logs
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Write all logs to console with detailed formatting
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
          let msg = `${timestamp} [${level}] : ${message}`;
          if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata, null, 2)}`;
          }
          return msg;
        })
      )
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: join(logDir, 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    // Write error logs to error.log
    new winston.transports.File({
      filename: join(logDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

export default logger; 