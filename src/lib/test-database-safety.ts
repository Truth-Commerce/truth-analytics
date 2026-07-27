export const ALLOW_REMOTE_TEST_DATABASE_TOKEN =
  'I_UNDERSTAND_THIS_IS_DESTRUCTIVE';

type TestDatabaseEnvironment = Record<string, string | undefined>;

type ParsedDatabaseUrl = {
  endpoint: DatabaseEndpoint;
  isLoopback: boolean;
};

type DatabaseEndpoint = {
  host: string;
  port: string;
  databasePath: string;
};

export type ResolvedTestDatabaseUrls = {
  databaseUrl: string;
  directUrl: string;
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Resolves database targets that destructive test code may use. This function
 * is synchronous and pure so callers can reject unsafe configuration before
 * importing a database client or opening a connection.
 */
export function resolveTestDatabaseUrls(
  environment: TestDatabaseEnvironment,
): ResolvedTestDatabaseUrls {
  const databaseUrl = environment.DATABASE_URL_TEST;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL_TEST ausente para uma operação de banco de teste.');
  }

  const directUrl = environment.DATABASE_URL_TEST_DIRECT ?? databaseUrl;
  const databaseTarget = parseTestDatabaseUrl(databaseUrl, 'DATABASE_URL_TEST');
  const directTarget = parseTestDatabaseUrl(
    directUrl,
    'DATABASE_URL_TEST_DIRECT',
  );

  for (const target of [databaseTarget, directTarget]) {
    if (
      !target.isLoopback &&
      environment.ALLOW_REMOTE_TEST_DATABASE !==
        ALLOW_REMOTE_TEST_DATABASE_TOKEN
    ) {
      throw new Error(
        'Banco de teste remoto recusado. Defina ALLOW_REMOTE_TEST_DATABASE=I_UNDERSTAND_THIS_IS_DESTRUCTIVE para autorizar explicitamente esta operação destrutiva.',
      );
    }

    rejectRuntimeEndpoint(target, environment, 'POSTGRES_URL');
    rejectRuntimeEndpoint(target, environment, 'POSTGRES_URL_DIRECT');
  }

  return { databaseUrl, directUrl };
}

function parseTestDatabaseUrl(
  value: string,
  variableName: 'DATABASE_URL_TEST' | 'DATABASE_URL_TEST_DIRECT',
): ParsedDatabaseUrl {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} inválida; informe uma URL postgresql:// válida.`);
  }

  if (
    (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
    !url.hostname ||
    !url.pathname ||
    url.pathname === '/'
  ) {
    throw new Error(`${variableName} inválida; informe uma URL postgresql:// válida.`);
  }

  try {
    const endpoint = endpointFromUrl(url);
    return { endpoint, isLoopback: LOOPBACK_HOSTS.has(endpoint.host) };
  } catch {
    throw new Error(`${variableName} inválida; informe uma URL postgresql:// válida.`);
  }
}

function rejectRuntimeEndpoint(
  testTarget: ParsedDatabaseUrl,
  environment: TestDatabaseEnvironment,
  runtimeVariable: 'POSTGRES_URL' | 'POSTGRES_URL_DIRECT',
) {
  if (testTarget.isLoopback) return;

  const runtimeUrl = environment[runtimeVariable];
  if (!runtimeUrl) return;

  const runtimeTarget = parseRuntimeDatabaseUrl(runtimeUrl);
  if (runtimeTarget && sameEndpoint(testTarget.endpoint, runtimeTarget)) {
    throw new Error(
      `Banco de teste remoto recusado: o endpoint coincide com ${runtimeVariable}.`,
    );
  }
}

function parseRuntimeDatabaseUrl(value: string): DatabaseEndpoint | undefined {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
      !url.hostname ||
      !url.pathname ||
      url.pathname === '/'
    ) {
      return undefined;
    }
    return endpointFromUrl(url);
  } catch {
    return undefined;
  }
}

function endpointFromUrl(url: URL): DatabaseEndpoint {
  return {
    host: url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''),
    port: url.port || '5432',
    databasePath: decodeURIComponent(url.pathname),
  };
}

function sameEndpoint(left: DatabaseEndpoint, right: DatabaseEndpoint) {
  return (
    left.host === right.host &&
    left.port === right.port &&
    left.databasePath === right.databasePath
  );
}
