// Global setup runs ONCE before all tests.
// It sets PW_E2E_RUN_ID to a stable value that all test workers will inherit.
export default function globalSetup() {
  // Only set if not already set (avoids overwriting on re-evaluation)
  if (!process.env.PW_E2E_RUN_ID) {
    process.env.PW_E2E_RUN_ID = String(Date.now());
  }
}
