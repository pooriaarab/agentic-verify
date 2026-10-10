// Shared core, re-exported from the published agentic-core pack.
//
// This file implements the frozen contract in agentic-core.d.ts by
// re-exporting the published build. src/contract.test.ts pins the two
// together, so drift fails typecheck. No local copy of this logic lives
// here, so all packs share one tested core.

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
} from "agentic-core";

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
} from "agentic-core";
