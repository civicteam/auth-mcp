import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryStateStore } from "./StateStore.js";
import type { OAuthState } from "./types.js";

describe("InMemoryStateStore", () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("set and get", () => {
    it("should store and retrieve state", async () => {
      const state: OAuthState = {
        redirectUri: "http://localhost:8080/callback",
        clientState: "client-123",
        codeChallenge: "challenge-456",
        codeChallengeMethod: "S256",
        createdAt: Date.now(),
        scope: "openid profile",
        clientId: "test-client",
      };

      await store.set("test-key", state);
      const retrieved = await store.get("test-key");

      expect(retrieved).toEqual(state);
    });

    it("should return null for non-existent key", async () => {
      const result = await store.get("non-existent");
      expect(result).toBeNull();
    });

    it("should overwrite existing state", async () => {
      const state1: OAuthState = {
        redirectUri: "http://localhost:8080/callback",
        clientState: "state-1",
        createdAt: Date.now(),
        clientId: "client-1",
      };

      const state2: OAuthState = {
        redirectUri: "http://localhost:9090/callback",
        clientState: "state-2",
        createdAt: Date.now(),
        clientId: "client-2",
      };

      await store.set("test-key", state1);
      await store.set("test-key", state2);

      const retrieved = await store.get("test-key");
      expect(retrieved).toEqual(state2);
    });
  });

  describe("delete", () => {
    it("should delete stored state", async () => {
      const state: OAuthState = {
        redirectUri: "http://localhost:8080/callback",
        clientState: "client-123",
        createdAt: Date.now(),
        clientId: "test-client",
      };

      await store.set("test-key", state);
      await store.delete("test-key");

      const result = await store.get("test-key");
      expect(result).toBeNull();
    });

    it("should not throw when deleting non-existent key", async () => {
      await expect(store.delete("non-existent")).resolves.not.toThrow();
    });
  });

  describe("expiration", () => {
    it("should return null for expired state", async () => {
      const state: OAuthState = {
        redirectUri: "http://localhost:8080/callback",
        clientState: "client-123",
        createdAt: Date.now(),
        clientId: "test-client",
      };

      await store.set("test-key", state);

      // Fast forward 11 minutes (expiration is 10 minutes)
      vi.advanceTimersByTime(11 * 60 * 1000);

      const result = await store.get("test-key");
      expect(result).toBeNull();
    });

    it("should delete expired state from store when accessed", async () => {
      const state: OAuthState = {
        redirectUri: "http://localhost:8080/callback",
        clientState: "client-123",
        createdAt: Date.now(),
        clientId: "test-client",
      };

      await store.set("test-key", state);

      // Fast forward 11 minutes (expiration is 10 minutes)
      vi.advanceTimersByTime(11 * 60 * 1000);

      // First get should return null and delete the state
      const result1 = await store.get("test-key");
      expect(result1).toBeNull();

      // Reset time to before expiration
      vi.setSystemTime(Date.now() - 11 * 60 * 1000);

      // Second get should still return null because state was deleted
      const result2 = await store.get("test-key");
      expect(result2).toBeNull();
    });

    it("should return state before expiration", async () => {
      const state: OAuthState = {
        redirectUri: "http://localhost:8080/callback",
        clientState: "client-123",
        createdAt: Date.now(),
        clientId: "test-client",
      };

      await store.set("test-key", state);

      // Fast forward 9 minutes (before expiration)
      vi.advanceTimersByTime(9 * 60 * 1000);

      const result = await store.get("test-key");
      expect(result).toEqual(state);
    });

    it("should clean up expired states automatically", async () => {
      const now = Date.now();

      const state1: OAuthState = {
        redirectUri: "http://localhost:8080/callback",
        clientState: "state-1",
        createdAt: now,
        clientId: "client-1",
      };

      await store.set("key-1", state1);

      // Fast forward 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Add second state with timestamp 5 minutes after the first
      const state2: OAuthState = {
        redirectUri: "http://localhost:9090/callback",
        clientState: "state-2",
        createdAt: now + 5 * 60 * 1000,
        clientId: "client-2",
      };

      await store.set("key-2", state2);

      // Fast forward another 6 minutes (total 11 minutes, key-1 should expire, key-2 should not)
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Try to get both
      const result1 = await store.get("key-1");
      const result2 = await store.get("key-2");

      expect(result1).toBeNull(); // Expired (11 minutes old)
      expect(result2).toEqual(state2); // Still valid (6 minutes old)
    });
  });

  describe("multiple states", () => {
    it("should handle multiple states independently", async () => {
      const states: Record<string, OAuthState> = {
        "key-1": {
          redirectUri: "http://localhost:8080/callback",
          clientState: "state-1",
          createdAt: Date.now(),
          clientId: "client-1",
        },
        "key-2": {
          redirectUri: "http://localhost:9090/callback",
          clientState: "state-2",
          createdAt: Date.now(),
          clientId: "client-2",
        },
        "key-3": {
          redirectUri: "http://localhost:7070/callback",
          clientState: "state-3",
          createdAt: Date.now(),
          clientId: "client-3",
        },
      };

      // Store all states
      for (const [key, state] of Object.entries(states)) {
        await store.set(key, state);
      }

      // Retrieve and verify all states
      for (const [key, expectedState] of Object.entries(states)) {
        const retrieved = await store.get(key);
        expect(retrieved).toEqual(expectedState);
      }

      // Delete one and verify others remain
      await store.delete("key-2");

      expect(await store.get("key-1")).toEqual(states["key-1"]);
      expect(await store.get("key-2")).toBeNull();
      expect(await store.get("key-3")).toEqual(states["key-3"]);
    });
  });

  describe("cleanup", () => {
    it("should remove expired states when cleanup is called", async () => {
      const now = Date.now();

      // Add states with different ages
      const state1: OAuthState = {
        redirectUri: "http://localhost:8080/callback",
        clientState: "state-1",
        createdAt: now - 11 * 60 * 1000, // 11 minutes ago (expired)
        clientId: "client-1",
      };

      const state2: OAuthState = {
        redirectUri: "http://localhost:9090/callback",
        clientState: "state-2",
        createdAt: now - 5 * 60 * 1000, // 5 minutes ago (valid)
        clientId: "client-2",
      };

      const state3: OAuthState = {
        redirectUri: "http://localhost:7070/callback",
        clientState: "state-3",
        createdAt: now - 15 * 60 * 1000, // 15 minutes ago (expired)
        clientId: "client-3",
      };

      await store.set("key-1", state1);
      await store.set("key-2", state2);
      await store.set("key-3", state3);

      // Run cleanup
      await store.cleanup();

      // Check that expired states are removed and valid ones remain
      expect(await store.get("key-1")).toBeNull();
      expect(await store.get("key-2")).toEqual(state2);
      expect(await store.get("key-3")).toBeNull();
    });

    it("should handle cleanup with no states", async () => {
      // Should not throw when no states exist
      await expect(store.cleanup()).resolves.not.toThrow();
    });

    it("should handle cleanup when all states are valid", async () => {
      const now = Date.now();

      const state1: OAuthState = {
        redirectUri: "http://localhost:8080/callback",
        clientState: "state-1",
        createdAt: now - 5 * 60 * 1000, // 5 minutes ago
        clientId: "client-1",
      };

      const state2: OAuthState = {
        redirectUri: "http://localhost:9090/callback",
        clientState: "state-2",
        createdAt: now - 3 * 60 * 1000, // 3 minutes ago
        clientId: "client-2",
      };

      await store.set("key-1", state1);
      await store.set("key-2", state2);

      await store.cleanup();

      // All states should remain
      expect(await store.get("key-1")).toEqual(state1);
      expect(await store.get("key-2")).toEqual(state2);
    });

    it("should handle cleanup when all states are expired", async () => {
      const now = Date.now();

      const state1: OAuthState = {
        redirectUri: "http://localhost:8080/callback",
        clientState: "state-1",
        createdAt: now - 11 * 60 * 1000, // 11 minutes ago
        clientId: "client-1",
      };

      const state2: OAuthState = {
        redirectUri: "http://localhost:9090/callback",
        clientState: "state-2",
        createdAt: now - 12 * 60 * 1000, // 12 minutes ago
        clientId: "client-2",
      };

      await store.set("key-1", state1);
      await store.set("key-2", state2);

      await store.cleanup();

      // All states should be removed
      expect(await store.get("key-1")).toBeNull();
      expect(await store.get("key-2")).toBeNull();
    });
  });
});
