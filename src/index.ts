export { VERSION } from "./version.js";
export {
  defineBrand,
  createLogger,
  GuardError,
  VendorError,
  createGuards,
  LocalRouterAdapter,
  HttpRouterAdapter,
  recordCost,
  getCostReport,
  resetCosts,
  createDryRunResult,
  dispatchText,
  summarizeText,
} from "./core.js";
export type {
  BrandConfig,
  LogLevel,
  Logger,
  LoggerOptions,
  CapsConfig,
  QuietHoursConfig,
  GuardsConfig,
  Guards,
  DispatchReceipt,
  RouterAdapter,
  HttpRouterOptions,
  CostEntry,
  CostReport,
  DispatchOptions,
  DispatchResult,
  TopWord,
  TextSummary,
  SummarizeOptions,
} from "./core.js";
export {
  ADAPTER_NAMES,
  LocalVerifyAdapter,
  MillionVerifierAdapter,
  ZeroBounceAdapter,
  resolveAdapter,
  createVerifyDryRun,
  verifyEmail,
  verifyEmails,
} from "./verify.js";
export type {
  VerifyVerdict,
  VerifyDetail,
  VerifyAdapter,
  VerifyOptions,
  VerifyResult,
  AdapterName,
  VendorHttpOptions,
  MillionVerifierOptions,
  ZeroBounceOptions,
} from "./verify.js";

import { defineBrand, type BrandConfig } from "./core.js";
import { VERSION } from "./version.js";

export const DEFAULT_BRAND: BrandConfig = defineBrand({
  name: "Agentic verify",
  command: "agentic-verify",
  description: "Check mail addresses before any send.",
  keywords: [
    "email-verification",
    "deliverability",
    "agentic-suite",
    "claude-code",
    "codex",
    "cli",
    "mcp",
  ],
  version: VERSION,
});
