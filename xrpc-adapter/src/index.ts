/**
 * open-banking XRPC adapter — CF Worker.
 *
 * Wires the kotoba reference impl (5 pure TS functions) into a deployable
 * CF Worker that exposes each function as an XRPC endpoint at
 * https://open-banking.etzhayyim.com/xrpc/com.etzhayyim.apps.openBanking.<cmd>
 *
 * Per ADR-2605210000 first execution-layer demonstration. Instantiates the
 * Etzhayyim SDK from env bindings (PDS_URL + session), calls the kotoba
 * function with parsed input, returns the result as JSON, and maps status
 * codes to HTTP responses.
 *
 * Single-file principle: all routing and handler logic here.
 */

import { z } from "zod";
import {
  createAuthedEtzhayyim,
  extractBearerToken,
  type Etzhayyim,
} from "@etzhayyim/sdk-auth";
import {
  createAccount,
  getAccount,
  listAccounts,
  transfer,
  listTransactions,
  type CreateAccountInput,
  type CreateAccountOutput,
  type GetAccountInput,
  type GetAccountOutput,
  type ListAccountsInput,
  type ListAccountsOutput,
  type TransferInput,
  type TransferOutput,
  type ListTransactionsInput,
  type ListTransactionsOutput,
} from "@etzhayyim/open-banking-kotoba";

/**
 * Inline Zod validator for transfer endpoint.
 *
 * Production: import from @etzhayyim/lexicon-to-zod/generated/openBanking.validators.js
 */
const transferInputSchema = z.object({
  transferId: z.string().min(1),
  clientRequestId: z.string().min(1),
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.string().min(1),
  memo: z.string().optional(),
});

interface Env {
  ACTOR_DID: string;
  PDS_URL: string;
  L2_RPC_URL: string;
  PDS_ACCESS_JWT?: string;
  PDS_REFRESH_JWT?: string;
}

type Handler = (e: Etzhayyim, input: unknown) => Promise<unknown>;

const NSID_BASE = "com.etzhayyim.apps.openBanking";

interface RouteConfig {
  method: "POST" | "GET";
  handler: Handler;
}

const routes: Record<string, RouteConfig> = {
  [`${NSID_BASE}.createAccount`]: {
    method: "POST",
    handler: (e, input) => createAccount(e, input as CreateAccountInput),
  },
  [`${NSID_BASE}.getAccount`]: {
    method: "GET",
    handler: (e, input) => getAccount(e, input as GetAccountInput),
  },
  [`${NSID_BASE}.listAccounts`]: {
    method: "GET",
    handler: (e, input) => listAccounts(e, input as ListAccountsInput),
  },
  [`${NSID_BASE}.transfer`]: {
    method: "POST",
    handler: (e, input) => transfer(e, input as TransferInput),
  },
  [`${NSID_BASE}.listTransactions`]: {
    method: "GET",
    handler: (e, input) => listTransactions(e, input as ListTransactionsInput),
  },
};

/**
 * Maps result.status to HTTP status code.
 *   - rejected → 400
 *   - accountNotFound / currencyMismatch → 400
 *   - alreadyExists / alreadyProcessed → 200 (idempotent)
 *   - other / default → 200
 *   - exception → 500
 */
function mapStatus(status?: string): number {
  if (status === "rejected") return 400;
  if (status === "accountNotFound" || status === "currencyMismatch") return 400;
  if (status === "alreadyExists" || status === "alreadyProcessed") return 200;
  return 200;
}

function jsonResponse(
  body: unknown,
  status: number = 200,
  init?: ResponseInit
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
    ...init,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // Only handle /xrpc/* paths
    if (!url.pathname.startsWith("/xrpc/")) {
      return jsonResponse({ error: "NotFound" }, 404);
    }

    const nsid = url.pathname.slice("/xrpc/".length);
    const route = routes[nsid];

    if (!route) {
      return jsonResponse({ error: "MethodNotFound", nsid }, 404);
    }

    if (req.method !== route.method) {
      return jsonResponse({ error: "MethodNotAllowed" }, 405);
    }

    // Instantiate Etzhayyim SDK with PDS session attached
    const bearerToken = extractBearerToken(req);
    const e = createAuthedEtzhayyim({
      env: {
        ACTOR_DID: env.ACTOR_DID,
        PDS_URL: env.PDS_URL,
        L2_RPC_URL: env.L2_RPC_URL,
        PDS_ACCESS_JWT: env.PDS_ACCESS_JWT,
        PDS_REFRESH_JWT: env.PDS_REFRESH_JWT,
      },
      bearerToken,
    });

    // Parse input based on method
    let input: unknown;
    try {
      if (route.method === "POST") {
        input = await req.json().catch(() => ({}));
      } else {
        // GET: parse query params
        input = Object.fromEntries(url.searchParams.entries());
        // Coerce common numeric/boolean fields
        const typed = input as Record<string, unknown>;
        if (typed.includeBalance) {
          typed.includeBalance = typed.includeBalance === "true";
        }
        if (typed.amountMinor) {
          typed.amountMinor = Number(typed.amountMinor);
        }
        if (typed.limit) {
          typed.limit = Number(typed.limit);
        }
        if (typed.maxScan) {
          typed.maxScan = Number(typed.maxScan);
        }
      }
    } catch (err) {
      return jsonResponse(
        {
          error: "InvalidInput",
          message: `Failed to parse ${route.method === "POST" ? "JSON" : "query params"}`,
        },
        400
      );
    }

    // Validate input for transfer endpoint
    if (nsid === `${NSID_BASE}.transfer`) {
      const parsed = transferInputSchema.safeParse(input);
      if (!parsed.success) {
        return jsonResponse(
          {
            error: "InvalidInput",
            issues: parsed.error.issues,
          },
          400
        );
      }
      input = parsed.data;
    }

    // Call handler
    try {
      const result = await route.handler(e, input);
      const status = mapStatus((result as Record<string, unknown>)?.status as string | undefined);
      return jsonResponse(result, status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse(
        {
          error: "InternalError",
          message,
          nsid,
        },
        500
      );
    }
  },
} satisfies ExportedHandler<Env>;
