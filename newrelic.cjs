'use strict';

/**
 * New Relic agent configuration.
 *
 * Values are sourced from environment variables so the same file works
 * across every deployment target. See `.env.example` for the variables.
 *
 * This file MUST be CommonJS and is loaded via `node -r newrelic` before the
 * application bootstraps (see the `start` script in package.json).
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'toutbox-carrier-service'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY || '',
  agent_enabled: process.env.NEW_RELIC_ENABLED === 'true',
  logging: {
    enabled: false,
    level: process.env.NEW_RELIC_LOG_LEVEL || 'info',
  },
  allow_all_headers: true,
  distributed_tracing: {
    enabled: false,
  },
  application_logging: {
    enabled: false,
    forwarding: {
      enabled: false,
    },
  },
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x-*',
      'response.headers.cookie',
      'response.headers.authorization',
    ],
  },
};
