import winston from 'winston';
import { env } from '@config/env';

const { combine, timestamp, printf, json, colorize } = winston.format;

// Format for development: "TIMESTAMP [LEVEL]: MESSAGE {metadata}"
const devFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  return `${ts} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'test' ? 'error' : 'info',
  format: combine(timestamp(), json()),
  transports: [
    new winston.transports.Console({
      format:
        env.NODE_ENV === 'production'
          ? combine(timestamp(), json())
          : combine(colorize(), timestamp(), devFormat),
    }),
  ],
});
