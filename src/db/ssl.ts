/**
 * Decides whether SSL should be enabled for a postgres connection.
 * Explicit boolean wins; otherwise auto-enables for AWS RDS endpoints.
 */
export function shouldEnableSsl(
  connectionString: string,
  explicitSsl?: boolean,
): boolean {
  if (explicitSsl === true) return true;
  if (explicitSsl === false) return false;
  return connectionString.includes('rds.amazonaws.com');
}
