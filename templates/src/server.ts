import { getBuilder } from './app.js';

const server = await getBuilder().buildApi();
await server.start();
