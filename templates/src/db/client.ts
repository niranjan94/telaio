import { createDatabase, createPool } from 'telaio/db';
import config from '../config.js';
import logger from '../logger.js';

export const pool = await createPool(config, logger);
export const db = await createDatabase(pool);
