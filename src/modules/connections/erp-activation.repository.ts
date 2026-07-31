import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { hasPostgresErrorCode } from '@/db/postgres-error';
import { decryptConnectionSecret } from '@/modules/connections/connection-secrets';
import { serverEnv } from '@/lib/env';
import {
  reconcileOrderReadiness,
  type OrderReadiness,
  type OrderReadinessExecutor,
} from '@/modules/pipeline/order-reconciliation';

type Provider = 'bling' | 'olist';
type ActivationMode = 'automatic' | 'explicit';
type Executor = OrderReadinessExecutor;

type LockedOrganization = { status: string; analista_id: string | null };
type LockedActor = { role: string };
type LockedConnection = {
  provider: Provider;
  status: string;
  data_generation: number;
  provider_account_fingerprint: string | null;
  access_token: string | null;
  refresh_token: string | null;
};
type LockedPreparation = { live: boolean };

/**
 * Test-only seams. Production callers build activation inputs field by field and
 * never construct this object, so neither seam is reachable outside the suite.
 */
export type ActivationTestHooks = {
  /** Aborts the transaction between demotion and promotion. */
  failAfterDemotion?: boolean;
  /** Awaited right after the transaction opens, before any lock is taken. */
  barrier?: () => Promise<void>;
};

export type ActivateErpInput = {
  orgId: string;
  target: Provider;
  actorUserId: string | null;
  mode: ActivationMode;
};

export type RollbackErpInput = {
  orgId: string;
  target: 'bling';
  actorUserId: string;
};

type ActivationInput = ActivateErpInput & { __test?: ActivationTestHooks };

export type ActivationResult = {
  previous: Provider | null;
  active: Provider;
  mode: ActivationMode;
  expected: number | null;
  persisted: number | null;
  pendingDetails: number | null;
  quarantinedDetails: number | null;
  reasons: string[];
};

type SafeAuditDetails = {
  previous: Provider | null;
  target: Provider;
  mode: ActivationMode;
  expected: number | null;
  persisted: number | null;
  pendingDetails: number | null;
  quarantinedDetails: number | null;
};

const ACTIVATION_CONFLICT = 'erp_ativo_alterado';
const CONFLICT_CODES = ['23505', '40001', '40P01'];

function activationConflict(): never {
  throw new Error(ACTIVATION_CONFLICT);
}

function resultRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function safeResult(
  previous: Provider | null,
  active: Provider,
  mode: ActivationMode,
  readiness: OrderReadiness | null,
): ActivationResult {
  return {
    previous,
    active,
    mode,
    expected: readiness?.expectedCount ?? null,
    persisted: readiness?.actualCount ?? null,
    pendingDetails: readiness?.pendingDetails ?? null,
    quarantinedDetails: readiness?.quarantined ?? null,
    reasons: readiness?.reasons ?? [],
  };
}

function safeAuditDetails(result: ActivationResult, target: Provider): SafeAuditDetails {
  return {
    previous: result.previous,
    target,
    mode: result.mode,
    expected: result.expected,
    persisted: result.persisted,
    pendingDetails: result.pendingDetails,
    quarantinedDetails: result.quarantinedDetails,
  };
}

function assertEncryptedTokens(connection: LockedConnection, orgId: string): void {
  if (!connection.access_token || !connection.refresh_token) activationConflict();
  try {
    decryptConnectionSecret({
      orgId,
      provider: connection.provider,
      kind: 'access_token',
      ciphertext: connection.access_token,
    });
    decryptConnectionSecret({
      orgId,
      provider: connection.provider,
      kind: 'refresh_token',
      ciphertext: connection.refresh_token,
    });
  } catch {
    activationConflict();
  }
}

async function authorize(
  executor: Executor,
  input: ActivationInput,
): Promise<LockedOrganization> {
  const [organization] = resultRows<LockedOrganization>(await executor.execute(sql`
    SELECT status, analista_id
    FROM organizations
    WHERE id = ${input.orgId}
    FOR UPDATE
  `));
  if (!organization || organization.status !== 'active') activationConflict();

  if (input.mode === 'automatic') {
    if (input.actorUserId !== null) activationConflict();
    return organization;
  }

  const [actor] = resultRows<LockedActor>(await executor.execute(sql`
    SELECT role FROM users WHERE id = ${input.actorUserId} FOR SHARE
  `));
  const isAssignedAnalyst = actor?.role === 'analista' && organization.analista_id === input.actorUserId;
  if (actor?.role !== 'admin_truth' && !isAssignedAnalyst) activationConflict();
  return organization;
}

async function lockConnections(executor: Executor, orgId: string): Promise<LockedConnection[]> {
  return resultRows<LockedConnection>(await executor.execute(sql`
    SELECT provider, status, data_generation, provider_account_fingerprint, access_token, refresh_token
    FROM connections
    WHERE org_id = ${orgId}
    ORDER BY provider ASC
    FOR UPDATE
  `));
}

async function assertOlistReadiness(
  executor: Executor,
  orgId: string,
  target: LockedConnection,
): Promise<OrderReadiness> {
  if (!serverEnv.OLIST_DATA_SYNC_ENABLED || !serverEnv.OLIST_DATA_SYNC_ORG_IDS.includes(orgId)) {
    activationConflict();
  }
  if (!target.provider_account_fingerprint) activationConflict();

  const [preparation] = resultRows<LockedPreparation>(await executor.execute(sql`
    SELECT lease_token IS NOT NULL AND lease_expires_at > clock_timestamp() AS live
    FROM connection_sync_state
    WHERE org_id = ${orgId}
      AND provider = 'olist'
      AND source_generation = ${target.data_generation}
      AND account_fingerprint IS NOT DISTINCT FROM ${target.provider_account_fingerprint}
      AND resource = 'orders_prepare'
    FOR UPDATE
  `));
  if (!preparation || preparation.live) activationConflict();

  const readiness = await reconcileOrderReadiness({
    orgId,
    provider: 'olist',
    sourceGeneration: target.data_generation,
    accountFingerprint: target.provider_account_fingerprint,
  }, executor);
  if (!readiness.ready) activationConflict();
  return readiness;
}

async function switchActiveProvider(
  executor: Executor,
  input: ActivationInput,
  previous: Provider | null,
  readiness: OrderReadiness | null,
  action: 'erp.ativado' | 'erp.revertido',
): Promise<ActivationResult> {
  if (previous) {
    await executor.execute(sql`
      UPDATE connections SET status = 'configurado'
      WHERE org_id = ${input.orgId} AND provider = ${previous} AND status = 'ok'
    `);
  }
  if (input.__test?.failAfterDemotion) throw new Error('erp_activation_test_failure');

  await executor.execute(sql`
    UPDATE connections SET status = 'ok'
    WHERE org_id = ${input.orgId} AND provider = ${input.target} AND status = 'configurado'
  `);

  const result = safeResult(previous, input.target, input.mode, readiness);
  const audit = safeAuditDetails(result, input.target);
  await executor.execute(sql`
    INSERT INTO audit_log (org_id, user_id, acao, detalhes)
    VALUES (${input.orgId}, ${input.actorUserId}, ${action}, ${JSON.stringify(audit)}::jsonb)
  `);
  return result;
}

async function activateWithinTransaction(executor: Executor, input: ActivationInput): Promise<ActivationResult> {
  await authorize(executor, input);
  const connections = await lockConnections(executor, input.orgId);
  const target = connections.find((connection) => connection.provider === input.target);
  const previous = connections.find((connection) => connection.status === 'ok')?.provider ?? null;

  if (!target || !['configurado', 'ok'].includes(target.status) || previous === input.target) {
    activationConflict();
  }
  assertEncryptedTokens(target, input.orgId);
  if (input.mode === 'automatic' && previous !== null) activationConflict();

  const readiness = input.target === 'olist'
    ? await assertOlistReadiness(executor, input.orgId, target)
    : null;
  return switchActiveProvider(executor, input, previous, readiness, 'erp.ativado');
}

async function rollbackWithinTransaction(
  executor: Executor,
  input: RollbackErpInput & { __test?: ActivationTestHooks },
): Promise<ActivationResult> {
  const explicit: ActivationInput = { ...input, mode: 'explicit' };
  await authorize(executor, explicit);
  const connections = await lockConnections(executor, input.orgId);
  const target = connections.find((connection) => connection.provider === 'bling');
  const previous = connections.find((connection) => connection.status === 'ok')?.provider ?? null;
  if (!target || target.status !== 'configurado' || previous !== 'olist') activationConflict();
  assertEncryptedTokens(target, input.orgId);
  return switchActiveProvider(executor, explicit, previous, null, 'erp.revertido');
}

/**
 * PostgreSQL conflicts arrive wrapped by the driver/ORM, so the whole cause
 * chain is inspected before the stable domain error is published.
 */
function isDatabaseConflict(error: unknown): boolean {
  return CONFLICT_CODES.some((code) => hasPostgresErrorCode(error, code));
}

async function serializable<T>(
  hooks: ActivationTestHooks | undefined,
  operation: (executor: Executor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (transaction) => {
    await transaction.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    if (hooks?.barrier) await hooks.barrier();
    return operation(transaction);
  });
}

export async function activateErp(
  input: ActivateErpInput & { __test?: ActivationTestHooks },
): Promise<ActivationResult> {
  try {
    return await serializable(input.__test, (executor) => activateWithinTransaction(executor, input));
  } catch (error) {
    if (isDatabaseConflict(error)) activationConflict();
    throw error;
  }
}

export async function rollbackErp(
  input: RollbackErpInput & { __test?: ActivationTestHooks },
): Promise<ActivationResult> {
  try {
    return await serializable(input.__test, (executor) => rollbackWithinTransaction(executor, input));
  } catch (error) {
    if (isDatabaseConflict(error)) activationConflict();
    throw error;
  }
}
