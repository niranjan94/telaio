import { createLogger } from 'telaio/logger';

const logger = createLogger({ pretty: process.env.NODE_ENV !== 'production' });
export default logger;
