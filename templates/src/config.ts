import { loadConfigAsync } from 'telaio/config';
import definition from './telaio.config.js';

const config = await loadConfigAsync(definition);
export default config;
