import dotenv, { type DotenvPopulateInput } from 'dotenv';

/**
 * Loads environment variables from .env files and optionally from AWS SSM Parameter Store.
 * SSM loading is triggered when CONFIG_SOURCE starts with 'ssm:'.
 * Requires @aws-sdk/client-ssm as a peer dependency when using SSM.
 */
export async function loadEnv(): Promise<void> {
  dotenv.config({ quiet: true });

  if (process.env.CONFIG_SOURCE?.startsWith('ssm:')) {
    const ssmPath = process.env.CONFIG_SOURCE.slice(4);

    let ssmModule: {
      SSMClient: new () => {
        send: (command: unknown) => Promise<{ Parameter?: { Value?: string } }>;
      };
      GetParameterCommand: new (input: {
        Name: string;
        WithDecryption: boolean;
      }) => unknown;
    };

    try {
      const moduleName = '@aws-sdk/client-ssm';
      ssmModule = await import(/* webpackIgnore: true */ moduleName);
    } catch {
      throw new Error(
        "telaio: CONFIG_SOURCE=ssm requires '@aws-sdk/client-ssm' to be installed. " +
          'Run: pnpm add @aws-sdk/client-ssm',
      );
    }

    const client = new ssmModule.SSMClient();
    const { Parameter } = await client.send(
      new ssmModule.GetParameterCommand({
        Name: ssmPath,
        WithDecryption: true,
      }),
    );

    if (Parameter?.Value) {
      const parsed = dotenv.parse(Parameter.Value);
      dotenv.populate(process.env as DotenvPopulateInput, parsed, {
        override: false,
      });
    } else {
      console.error('telaio: SSM Parameter was not found', ssmPath);
    }
  }
}
