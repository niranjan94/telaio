import { execSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

/**
 * Checks whether Docker is available on the host.
 * Returns true if `docker info` succeeds, false otherwise.
 */
function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Vitest global setup for E2E tests.
 * Starts PostgreSQL and Redis containers via testcontainers.
 * Sets DATABASE_URL and REDIS_URL environment variables for the test suite.
 *
 * If Docker is not available, sets skipE2e=true and all tests should
 * check this flag to skip gracefully.
 */
export default async function setup(project: TestProject) {
  if (!isDockerAvailable()) {
    console.warn(
      '\n⚠ Docker is not available. Skipping E2E tests.\n' +
        '  Install Docker or start the Docker daemon to run E2E tests.\n',
    );
    project.provide('skipE2e', true);
    project.provide('databaseUrl', '');
    project.provide('redisUrl', '');
    return;
  }

  console.log('\nStarting E2E test containers...');

  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const { GenericContainer } = await import('testcontainers');

  // Start PostgreSQL
  const pgContainer = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('telaio_e2e')
    .withUsername('telaio')
    .withPassword('telaio')
    .start();

  const databaseUrl = pgContainer.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  project.provide('databaseUrl', databaseUrl);

  // Start Redis
  const redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  process.env.REDIS_URL = redisUrl;
  project.provide('redisUrl', redisUrl);
  project.provide('skipE2e', false);

  console.log(`  PostgreSQL: ${databaseUrl}`);
  console.log(`  Redis: ${redisUrl}\n`);

  // Return teardown function
  return async () => {
    console.log('\nStopping E2E test containers...');
    await pgContainer.stop();
    await redisContainer.stop();
    console.log('Containers stopped.\n');
  };
}

// Augment vitest provide types for type-safe access in tests
declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
    skipE2e: boolean;
  }
}
