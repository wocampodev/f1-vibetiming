import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  API_PORT: Joi.number().default(4000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis'] })
    .optional(),
  ERGAST_BASE_URL: Joi.string().uri().default('https://api.jolpi.ca/ergast'),
  OPENF1_BASE_URL: Joi.string().uri().optional(),
  OPENF1_POLL_MINUTES: Joi.number().integer().min(1).default(10),
  LIVE_SOURCE: Joi.string().valid('simulator', 'provider').default('simulator'),
  LIVE_SIMULATOR_TICK_MS: Joi.number().integer().min(250).default(2000),
  LIVE_SIMULATOR_SPEED_MULTIPLIER: Joi.number().min(0.25).max(8).default(1),
  LIVE_HEARTBEAT_MS: Joi.number().integer().min(1000).default(15000),
  LIVE_SIMULATOR_SEED: Joi.number().integer().min(1).default(2026),
  LIVE_PROVIDER_LEGAL_APPROVED: Joi.boolean().default(false),
});
