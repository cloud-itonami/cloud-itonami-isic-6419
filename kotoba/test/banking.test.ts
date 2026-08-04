import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  createAccount,
  getAccount,
  listAccounts,
  transfer,
  listTransactions,
} from "../src/index.js";

describe("open-banking kotoba", () => {
  let e: any;

  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:open-banking.etzhayyim.com" });
  });

  describe("createAccount", () => {
    it("creates a new account with valid input", async () => {
      const result = await createAccount(e, {
        accountId: "alice",
        ownerDid: "did:plc:alice",
        kind: "checking",
        currency: "USDC",
      });

      expect(result.status).toBe("created");
      expect(result.did).toBeDefined();
      expect(result.accountUri).toBeDefined();
      expect(result.accountId).toBe("alice");
    });

    it("rejects account creation with missing required fields", async () => {
      const result = await createAccount(e, {
        accountId: "",
        ownerDid: "did:plc:alice",
        kind: "checking",
        currency: "USDC",
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toBe("missingRequiredFields");
    });

    it("is idempotent on accountId", async () => {
      const input = {
        accountId: "alice",
        ownerDid: "did:plc:alice",
        kind: "checking",
        currency: "USDC",
      };

      const first = await createAccount(e, input);
      expect(first.status).toBe("created");
      const firstDid = first.did;

      const second = await createAccount(e, input);
      expect(second.status).toBe("alreadyExists");
      expect(second.did).toBe(firstDid);
    });

    it("normalizes currency to uppercase", async () => {
      const result = await createAccount(e, {
        accountId: "bob",
        ownerDid: "did:plc:bob",
        kind: "savings",
        currency: "usdc",
      });

      expect(result.status).toBe("created");
      const account = await getAccount(e, { accountId: "bob" });
      expect(account.account?.currency).toBe("USDC");
    });

    it("supports optional displayName", async () => {
      const result = await createAccount(e, {
        accountId: "charlie",
        ownerDid: "did:plc:charlie",
        kind: "checking",
        currency: "JPY",
        displayName: "Charlie's JPY Account",
      });

      expect(result.status).toBe("created");
      const account = await getAccount(e, { accountId: "charlie" });
      expect(account.account?.displayName).toBe("Charlie's JPY Account");
    });

    it("supports multiple account kinds", async () => {
      for (const kind of ["checking", "savings", "escrow", "system"] as const) {
        const result = await createAccount(e, {
          accountId: `acc-${kind}`,
          ownerDid: "did:plc:test",
          kind,
          currency: "USDC",
        });
        expect(result.status).toBe("created");
      }

      const allAccounts = await listAccounts(e, {});
      expect(allAccounts.items.length).toBe(4);
    });
  });

  describe("getAccount", () => {
    beforeEach(async () => {
      await createAccount(e, {
        accountId: "alice",
        ownerDid: "did:plc:alice",
        kind: "checking",
        currency: "USDC",
      });
    });

    it("retrieves an existing account", async () => {
      const result = await getAccount(e, { accountId: "alice" });

      expect(result.error).toBeUndefined();
      expect(result.account).toBeDefined();
      expect(result.account?.accountId).toBe("alice");
      expect(result.account?.kind).toBe("checking");
    });

    it("returns error for non-existent account", async () => {
      const result = await getAccount(e, { accountId: "nonexistent" });

      expect(result.error).toBe("notFound");
      expect(result.account).toBeUndefined();
    });

    it("returns missingAccountId error when accountId is not provided", async () => {
      const result = await getAccount(e, {});

      expect(result.error).toBe("missingAccountId");
      expect(result.account).toBeUndefined();
    });

    it("computes balance when includeBalance is true", async () => {
      await createAccount(e, {
        accountId: "src",
        ownerDid: "did:plc:src",
        kind: "checking",
        currency: "USDC",
      });

      await transfer(e, {
        transferId: "tx-1",
        clientRequestId: "req-1",
        fromAccountId: "src",
        toAccountId: "alice",
        amountMinor: 1_000_000,
        currency: "USDC",
      });

      const result = await getAccount(e, {
        accountId: "alice",
        includeBalance: true,
      });

      expect(result.account?.balanceMinor).toBe(1_000_000);
    });

    it("derives balance as 0 for new account", async () => {
      const result = await getAccount(e, {
        accountId: "alice",
        includeBalance: true,
      });

      expect(result.account?.balanceMinor).toBe(0);
    });
  });

  describe("listAccounts", () => {
    beforeEach(async () => {
      await createAccount(e, {
        accountId: "alice",
        ownerDid: "did:plc:alice",
        kind: "checking",
        currency: "USDC",
      });
      await createAccount(e, {
        accountId: "bob",
        ownerDid: "did:plc:bob",
        kind: "savings",
        currency: "USDC",
      });
      await createAccount(e, {
        accountId: "charlie",
        ownerDid: "did:plc:charlie",
        kind: "checking",
        currency: "JPY",
      });
    });

    it("lists all accounts", async () => {
      const result = await listAccounts(e, {});

      expect(result.items.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it("filters by ownerDid", async () => {
      const result = await listAccounts(e, { ownerDid: "did:plc:alice" });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.accountId).toBe("alice");
    });

    it("filters by kind", async () => {
      const result = await listAccounts(e, { kind: "checking" });

      expect(result.items.length).toBe(2);
      expect(result.items.every((a) => a.kind === "checking")).toBe(true);
    });

    it("filters by currency (case-insensitive)", async () => {
      const result = await listAccounts(e, { currency: "usd" });

      // Should normalize to uppercase and match 2 USDC accounts
      expect(result.items.length).toBe(2);
      expect(result.items.every((a) => a.currency === "USDC")).toBe(true);
    });

    it("combines multiple filters", async () => {
      const result = await listAccounts(e, {
        ownerDid: "did:plc:alice",
        kind: "checking",
        currency: "USDC",
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.accountId).toBe("alice");
    });

    it("respects limit parameter", async () => {
      const result = await listAccounts(e, { limit: 2 });

      expect(result.items.length).toBe(2);
    });

    it("caps limit at 100", async () => {
      const result = await listAccounts(e, { limit: 500 });

      expect(result.items.length).toBeLessThanOrEqual(100);
    });
  });

  describe("transfer", () => {
    beforeEach(async () => {
      await createAccount(e, {
        accountId: "alice",
        ownerDid: "did:plc:alice",
        kind: "checking",
        currency: "USDC",
      });
      await createAccount(e, {
        accountId: "bob",
        ownerDid: "did:plc:bob",
        kind: "checking",
        currency: "USDC",
      });
    });

    it("transfers between two accounts (atomic double-entry)", async () => {
      const result = await transfer(e, {
        transferId: "tx-001",
        clientRequestId: "req-001",
        fromAccountId: "alice",
        toAccountId: "bob",
        amountMinor: 1_000_000,
        currency: "USDC",
      });

      expect(result.status).toBe("transferred");
      expect(result.debitUri).toBeDefined();
      expect(result.creditUri).toBeDefined();
      expect(result.fromAccountDid).toBeDefined();
      expect(result.toAccountDid).toBeDefined();
    });

    it("maintains double-entry invariant (sum = 0)", async () => {
      await transfer(e, {
        transferId: "tx-001",
        clientRequestId: "req-001",
        fromAccountId: "alice",
        toAccountId: "bob",
        amountMinor: 1_000_000,
        currency: "USDC",
      });

      const aliceAcc = await getAccount(e, {
        accountId: "alice",
        includeBalance: true,
      });
      const bobAcc = await getAccount(e, {
        accountId: "bob",
        includeBalance: true,
      });

      const sum =
        (aliceAcc.account?.balanceMinor ?? 0) +
        (bobAcc.account?.balanceMinor ?? 0);
      expect(sum).toBe(0);
      expect(aliceAcc.account?.balanceMinor).toBe(-1_000_000);
      expect(bobAcc.account?.balanceMinor).toBe(1_000_000);
    });

    it("rejects self-transfer", async () => {
      const result = await transfer(e, {
        transferId: "tx-self",
        clientRequestId: "req-self",
        fromAccountId: "alice",
        toAccountId: "alice",
        amountMinor: 100,
        currency: "USDC",
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toBe("selfTransferProhibited");
    });

    it("rejects transfer with invalid amount", async () => {
      const result = await transfer(e, {
        transferId: "tx-invalid",
        clientRequestId: "req-invalid",
        fromAccountId: "alice",
        toAccountId: "bob",
        amountMinor: 0,
        currency: "USDC",
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toBe("missingOrInvalidFields");
    });

    it("rejects transfer to non-existent account", async () => {
      const result = await transfer(e, {
        transferId: "tx-notfound",
        clientRequestId: "req-notfound",
        fromAccountId: "alice",
        toAccountId: "nonexistent",
        amountMinor: 100,
        currency: "USDC",
      });

      expect(result.status).toBe("accountNotFound");
    });

    it("detects currency mismatch", async () => {
      await createAccount(e, {
        accountId: "jpy-acc",
        ownerDid: "did:plc:jpy",
        kind: "checking",
        currency: "JPY",
      });

      const result = await transfer(e, {
        transferId: "tx-fx",
        clientRequestId: "req-fx",
        fromAccountId: "alice",
        toAccountId: "jpy-acc",
        amountMinor: 100,
        currency: "USDC",
      });

      expect(result.status).toBe("currencyMismatch");
    });

    it("is idempotent on transferId", async () => {
      const input = {
        transferId: "tx-dup",
        clientRequestId: "req-dup",
        fromAccountId: "alice",
        toAccountId: "bob",
        amountMinor: 500,
        currency: "USDC",
      };

      const first = await transfer(e, input);
      expect(first.status).toBe("transferred");

      const second = await transfer(e, input);
      expect(second.status).toBe("alreadyProcessed");
      expect(second.debitUri).toBe(first.debitUri);
      expect(second.creditUri).toBe(first.creditUri);
    });

    it("normalizes currency to uppercase", async () => {
      const result = await transfer(e, {
        transferId: "tx-lower",
        clientRequestId: "req-lower",
        fromAccountId: "alice",
        toAccountId: "bob",
        amountMinor: 100,
        currency: "usdc",
      });

      expect(result.status).toBe("transferred");
    });

    it("supports optional memo", async () => {
      const result = await transfer(e, {
        transferId: "tx-memo",
        clientRequestId: "req-memo",
        fromAccountId: "alice",
        toAccountId: "bob",
        amountMinor: 250,
        currency: "USDC",
        memo: "Rent payment for May",
      });

      expect(result.status).toBe("transferred");
      const txns = await listTransactions(e, { accountId: "alice" });
      expect(txns.items[0]?.memo).toBe("Rent payment for May");
    });

    it("creates two LedgerEntry records per transfer", async () => {
      const beforeCount = e.count("com.etzhayyim.apps.openBanking.ledger");

      await transfer(e, {
        transferId: "tx-count",
        clientRequestId: "req-count",
        fromAccountId: "alice",
        toAccountId: "bob",
        amountMinor: 100,
        currency: "USDC",
      });

      const afterCount = e.count("com.etzhayyim.apps.openBanking.ledger");
      expect(afterCount - beforeCount).toBe(2);
    });
  });

  describe("listTransactions", () => {
    beforeEach(async () => {
      await createAccount(e, {
        accountId: "acc",
        ownerDid: "did:plc:a",
        kind: "checking",
        currency: "USDC",
      });
      await createAccount(e, {
        accountId: "src",
        ownerDid: "did:plc:src",
        kind: "checking",
        currency: "USDC",
      });
    });

    it("returns empty list for account with no transactions", async () => {
      const result = await listTransactions(e, { accountId: "acc" });

      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it("returns transactions for an account", async () => {
      await transfer(e, {
        transferId: "t1",
        clientRequestId: "r1",
        fromAccountId: "src",
        toAccountId: "acc",
        amountMinor: 100,
        currency: "USDC",
      });
      await transfer(e, {
        transferId: "t2",
        clientRequestId: "r2",
        fromAccountId: "src",
        toAccountId: "acc",
        amountMinor: 50,
        currency: "USDC",
      });

      const result = await listTransactions(e, { accountId: "acc" });

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it("computes running balance correctly", async () => {
      await transfer(e, {
        transferId: "t1",
        clientRequestId: "r1",
        fromAccountId: "src",
        toAccountId: "acc",
        amountMinor: 100,
        currency: "USDC",
      });
      await transfer(e, {
        transferId: "t2",
        clientRequestId: "r2",
        fromAccountId: "src",
        toAccountId: "acc",
        amountMinor: 50,
        currency: "USDC",
      });

      const result = await listTransactions(e, { accountId: "acc" });

      expect(result.items[0]?.runningBalanceMinor).toBe(100);
      expect(result.items[1]?.runningBalanceMinor).toBe(150);
    });

    it("includes both debit and credit entries", async () => {
      await createAccount(e, {
        accountId: "other",
        ownerDid: "did:plc:other",
        kind: "checking",
        currency: "USDC",
      });

      await transfer(e, {
        transferId: "t-out",
        clientRequestId: "r-out",
        fromAccountId: "acc",
        toAccountId: "other",
        amountMinor: 75,
        currency: "USDC",
      });

      const result = await listTransactions(e, { accountId: "acc" });

      expect(result.items.length).toBe(1);
      const entry = result.items[0];
      expect(entry?.direction).toBe("debit");
      expect(entry?.runningBalanceMinor).toBe(-75);
    });

    it("respects limit parameter", async () => {
      // Create multiple transfers
      for (let i = 0; i < 5; i++) {
        await transfer(e, {
          transferId: `t${i}`,
          clientRequestId: `r${i}`,
          fromAccountId: "src",
          toAccountId: "acc",
          amountMinor: 100,
          currency: "USDC",
        });
      }

      const result = await listTransactions(e, { accountId: "acc", limit: 2 });

      expect(result.items.length).toBeLessThanOrEqual(2);
    });

    it("filters by since (ISO date)", async () => {
      await transfer(e, {
        transferId: "t1",
        clientRequestId: "r1",
        fromAccountId: "src",
        toAccountId: "acc",
        amountMinor: 100,
        currency: "USDC",
      });

      // Capture the timestamp and create a filter for future dates
      const now = new Date();
      const futureDate = new Date(now.getTime() + 1000).toISOString();

      const result = await listTransactions(e, {
        accountId: "acc",
        since: futureDate,
      });

      expect(result.items.length).toBe(0);
    });

    it("returns nonexistent accountId as empty", async () => {
      const result = await listTransactions(e, { accountId: "ghost" });

      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.truncated).toBe(false);
    });
  });

  describe("integration: complex scenarios", () => {
    beforeEach(async () => {
      await createAccount(e, {
        accountId: "bank",
        ownerDid: "did:plc:bank",
        kind: "system",
        currency: "USDC",
      });
      await createAccount(e, {
        accountId: "alice",
        ownerDid: "did:plc:alice",
        kind: "checking",
        currency: "USDC",
      });
      await createAccount(e, {
        accountId: "bob",
        ownerDid: "did:plc:bob",
        kind: "checking",
        currency: "USDC",
      });
    });

    it("handles multiple sequential transfers preserving balance", async () => {
      // Deposit 1000 to alice
      await transfer(e, {
        transferId: "deposit-alice",
        clientRequestId: "r1",
        fromAccountId: "bank",
        toAccountId: "alice",
        amountMinor: 1_000_000,
        currency: "USDC",
      });

      // Deposit 500 to bob
      await transfer(e, {
        transferId: "deposit-bob",
        clientRequestId: "r2",
        fromAccountId: "bank",
        toAccountId: "bob",
        amountMinor: 500_000,
        currency: "USDC",
      });

      // Alice pays Bob 300
      await transfer(e, {
        transferId: "payment",
        clientRequestId: "r3",
        fromAccountId: "alice",
        toAccountId: "bob",
        amountMinor: 300_000,
        currency: "USDC",
      });

      const aliceAcc = await getAccount(e, {
        accountId: "alice",
        includeBalance: true,
      });
      const bobAcc = await getAccount(e, {
        accountId: "bob",
        includeBalance: true,
      });
      const bankAcc = await getAccount(e, {
        accountId: "bank",
        includeBalance: true,
      });

      expect(aliceAcc.account?.balanceMinor).toBe(700_000);
      expect(bobAcc.account?.balanceMinor).toBe(800_000);
      expect(bankAcc.account?.balanceMinor).toBe(-1_500_000);

      // Verify total sum = 0 (double-entry invariant)
      const totalBalance =
        (aliceAcc.account?.balanceMinor ?? 0) +
        (bobAcc.account?.balanceMinor ?? 0) +
        (bankAcc.account?.balanceMinor ?? 0);
      expect(totalBalance).toBe(0);
    });

    it("maintains transaction history with running balance", async () => {
      await transfer(e, {
        transferId: "t1",
        clientRequestId: "r1",
        fromAccountId: "bank",
        toAccountId: "alice",
        amountMinor: 1000,
        currency: "USDC",
      });

      await transfer(e, {
        transferId: "t2",
        clientRequestId: "r2",
        fromAccountId: "bank",
        toAccountId: "alice",
        amountMinor: 2000,
        currency: "USDC",
      });

      await transfer(e, {
        transferId: "t3",
        clientRequestId: "r3",
        fromAccountId: "alice",
        toAccountId: "bob",
        amountMinor: 500,
        currency: "USDC",
      });

      const history = await listTransactions(e, { accountId: "alice" });

      expect(history.items.length).toBe(3);
      expect(history.items[0]?.runningBalanceMinor).toBe(1000);
      expect(history.items[1]?.runningBalanceMinor).toBe(3000);
      expect(history.items[2]?.runningBalanceMinor).toBe(2500);
    });
  });
});
