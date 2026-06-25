import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock resend — must be declared before any import so Vitest hoists it.
// ---------------------------------------------------------------------------
vi.mock('resend', () => {
  const sendMock = vi.fn();
  const ResendMock = vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  }));
  // Expose sendMock on the constructor so tests can reference it
  (ResendMock as unknown as { _sendMock: ReturnType<typeof vi.fn> })._sendMock = sendMock;
  return { Resend: ResendMock };
});

// Mock serverEnv with RESEND_API_KEY + EMAIL_FROM configured (default for most tests)
vi.mock('@/lib/env', () => ({
  serverEnv: {
    RESEND_API_KEY: 'test-key',
    EMAIL_FROM: 'from@truth.com',
    APP_URL: 'http://localhost:3100',
    ADMIN_ALERT_EMAIL: undefined,
  },
}));

// ---------------------------------------------------------------------------
// Case A + C — configured: RESEND_API_KEY and EMAIL_FROM are set
// ---------------------------------------------------------------------------

describe('email wrappers — configurado (com chaves)', () => {
  let sendReportReadyEmail: typeof import('@/modules/notifications/email').sendReportReadyEmail;
  let sendAccountActivatedEmail: typeof import('@/modules/notifications/email').sendAccountActivatedEmail;
  let sendPipelineFailedEmail: typeof import('@/modules/notifications/email').sendPipelineFailedEmail;
  let sendBlingConnectionFailedEmail: typeof import('@/modules/notifications/email').sendBlingConnectionFailedEmail;
  let resendSendMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const emailModule = await import('@/modules/notifications/email');
    sendReportReadyEmail = emailModule.sendReportReadyEmail;
    sendAccountActivatedEmail = emailModule.sendAccountActivatedEmail;
    sendPipelineFailedEmail = emailModule.sendPipelineFailedEmail;
    sendBlingConnectionFailedEmail = emailModule.sendBlingConnectionFailedEmail;

    const resend = await import('resend');
    const ResendCtor = resend.Resend as unknown as { _sendMock: ReturnType<typeof vi.fn> };
    resendSendMock = ResendCtor._sendMock;
  });

  it('Case A — sendReportReadyEmail chama resend.emails.send com to/subject/from corretos', async () => {
    resendSendMock.mockResolvedValueOnce({ id: 'email-id-1' });

    await sendReportReadyEmail('c@x.com', 'rep-1');

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const call = resendSendMock.mock.calls[0][0];
    expect(call.to).toBe('c@x.com');
    expect(call.from).toBe('from@truth.com');
    expect(typeof call.subject).toBe('string');
    expect(call.subject.length).toBeGreaterThan(0);
    expect(call.html).toContain('rep-1');
    expect(call.text).toContain('rep-1');
  });

  it('Case A — sendAccountActivatedEmail chama send com from/to corretos', async () => {
    resendSendMock.mockResolvedValueOnce({ id: 'email-id-2' });

    await sendAccountActivatedEmail('cliente@org.com', 'weekly');

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const call = resendSendMock.mock.calls[0][0];
    expect(call.to).toBe('cliente@org.com');
    expect(call.from).toBe('from@truth.com');
  });

  it('Case A — sendPipelineFailedEmail chama send com to/from/subject corretos', async () => {
    resendSendMock.mockResolvedValueOnce({ id: 'email-id-3' });

    await sendPipelineFailedEmail('admin@truth.com', 'org-1', 'rep-1', 'falha_x');

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const call = resendSendMock.mock.calls[0][0];
    expect(call.to).toBe('admin@truth.com');
    expect(call.from).toBe('from@truth.com');
    expect(call.text).toContain('falha_x');
  });

  it('Case A — sendBlingConnectionFailedEmail chama send com to correto', async () => {
    resendSendMock.mockResolvedValueOnce({ id: 'email-id-4' });

    await sendBlingConnectionFailedEmail('cliente@org.com');

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const call = resendSendMock.mock.calls[0][0];
    expect(call.to).toBe('cliente@org.com');
  });

  it('Case C — send rejeita: wrapper NAO lanca (engole o erro)', async () => {
    resendSendMock.mockRejectedValueOnce(new Error('network timeout'));

    await expect(sendReportReadyEmail('c@x.com', 'rep-2')).resolves.toBeUndefined();
    expect(resendSendMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Case B — sem chaves: no-op, NAO chama send, NAO lanca
// ---------------------------------------------------------------------------

describe('email wrappers — sem chaves (no-op)', () => {
  let sendReportReadyEmail: typeof import('@/modules/notifications/email').sendReportReadyEmail;
  let resendSendMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Override serverEnv to have no keys
    vi.doMock('@/lib/env', () => ({
      serverEnv: {
        RESEND_API_KEY: undefined,
        EMAIL_FROM: undefined,
        APP_URL: 'http://localhost:3100',
        ADMIN_ALERT_EMAIL: undefined,
      },
    }));

    const emailModule = await import('@/modules/notifications/email');
    sendReportReadyEmail = emailModule.sendReportReadyEmail;

    const resend = await import('resend');
    const ResendCtor = resend.Resend as unknown as { _sendMock: ReturnType<typeof vi.fn> };
    resendSendMock = ResendCtor._sendMock;
  });

  it('Case B — sem RESEND_API_KEY/EMAIL_FROM: NAO chama send, NAO lanca', async () => {
    await expect(sendReportReadyEmail('c@x.com', 'rep-noop')).resolves.toBeUndefined();
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
