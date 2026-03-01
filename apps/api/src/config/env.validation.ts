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
});
