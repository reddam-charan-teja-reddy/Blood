import crypto from 'crypto';
import { config } from '../config/env.js';

const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentLevelPriority = LOG_LEVELS[config.LOG_LEVEL] ?? LOG_LEVELS.info;

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
};

const LEVEL_COLORS = {
  debug: COLORS.magenta,
  info: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
};

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();

  if (config.LOG_FORMAT === 'json') {
    const entry = {
      timestamp,
      level,
      message,
      service: 'blood-network-api',
      pid: process.pid,
      ...meta,
    };
    if (meta.error && meta.error instanceof Error) {
      entry.error = {
        name: meta.error.name,
        message: meta.error.message,
        stack: meta.error.stack,
      };
    }
    return JSON.stringify(entry);
  }

  // Pretty Console Output for Local Development
  const color = LEVEL_COLORS[level] || COLORS.reset;
  const levelBadge = `${color}${COLORS.bold}[${level.toUpperCase()}]${COLORS.reset}`;
  const reqBadge = meta.reqId ? ` ${COLORS.cyan}[req:${meta.reqId}]${COLORS.reset}` : '';
  const durationBadge = meta.durationMs !== undefined ? ` ${COLORS.dim}(${meta.durationMs}ms)${COLORS.reset}` : '';

  let extra = '';
  const { reqId, durationMs, error, ...restMeta } = meta;
  if (Object.keys(restMeta).length > 0) {
    extra = ` ${COLORS.dim}${JSON.stringify(restMeta)}${COLORS.reset}`;
  }
  if (error && error instanceof Error) {
    extra += `\n${COLORS.red}${error.stack || error.message}${COLORS.reset}`;
  }

  return `${COLORS.dim}${timestamp}${COLORS.reset} ${levelBadge}${reqBadge} ${message}${durationBadge}${extra}`;
}

export const logger = {
  debug(message, meta = {}) {
    if (currentLevelPriority <= LOG_LEVELS.debug) {
      console.log(formatMessage('debug', message, meta));
    }
  },

  info(message, meta = {}) {
    if (currentLevelPriority <= LOG_LEVELS.info) {
      console.log(formatMessage('info', message, meta));
    }
  },

  warn(message, meta = {}) {
    if (currentLevelPriority <= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  error(message, meta = {}) {
    if (currentLevelPriority <= LOG_LEVELS.error) {
      console.error(formatMessage('error', message, meta));
    }
  },
};

/**
 * Express middleware for correlation request tracking and structured HTTP access logging
 */
export const httpLogger = (req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomBytes(4).toString('hex');
  res.setHeader('X-Request-Id', req.id);

  if (!config.ENABLE_HTTP_LOGGING) {
    return next();
  }

  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;
    const logData = {
      reqId: req.id,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      durationMs,
      ip: req.ip || req.socket.remoteAddress,
      userId: req.user?.id || req.user?._id,
    };

    const msg = `${req.method} ${req.originalUrl || req.url} -> ${statusCode}`;

    if (statusCode >= 500) {
      logger.error(msg, logData);
    } else if (statusCode >= 400) {
      logger.warn(msg, logData);
    } else {
      logger.info(msg, logData);
    }
  });

  next();
};

export default logger;
