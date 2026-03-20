// To use the consumer, add .withQueues(queues) to the builder in app.ts
// See: https://telaio.dev/docs/modules/queues
import { getBuilder } from './app.js';

const consumer = await getBuilder().buildConsumer();
await consumer.start();
