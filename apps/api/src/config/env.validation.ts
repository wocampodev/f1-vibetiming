import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  API_PORT: Joi.number().default(4000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  ERGAST_BASE_URL: Joi.string().uri().default('https://api.jolpi.ca/ergast'),
  LIVE_SOURCE: Joi.string().valid('simulator', 'provider').default('provider'),
  LIVE_SIMULATOR_TICK_MS: Joi.number().integer().min(250).default(2000),
  LIVE_SIMULATOR_SPEED_MULTIPLIER: Joi.number().min(0.25).max(8).default(1),
  LIVE_HEARTBEAT_MS: Joi.number().integer().min(1000).default(15000),
  LIVE_SIMULATOR_SEED: Joi.number().integer().min(1).default(2026),
  LIVE_SIGNALR_BASE_URL: Joi.string()
    .uri({ scheme: ['https', 'http'] })
    .default('https://livetiming.formula1.com/signalr'),
  LIVE_SIGNALR_HUB: Joi.string().default('streaming'),
  LIVE_SIGNALR_TOPICS: Joi.string().default(
    'SessionInfo,SessionStatus,LapCount,TrackStatus,DriverList,TimingData,TimingAppData,RaceControlMessages',
  ),
  LIVE_SIGNALR_RECONNECT_MIN_MS: Joi.number().integer().min(250).default(1000),
  LIVE_SIGNALR_RECONNECT_MAX_MS: Joi.number()
    .integer()
    .min(1000)
    .default(30000),
});
