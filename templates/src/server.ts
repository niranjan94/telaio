import { buildApp } from './app.js';

const app = await buildApp();
await app.start();
