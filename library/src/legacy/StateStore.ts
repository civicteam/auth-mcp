import { STATE_EXPIRATION_MS } from "./constants.js";
import type { OAuthState, StateStore } from "./types.js";

/**
 * In-memory implementation of OAuth state store
 * For production use, consider Redis or another persistent store
 */
export class InMemoryStateStore implements StateStore {
  private states: Map<string, OAuthState> = new Map();

  async set(key: string, state: OAuthState): Promise<void> {
    this.states.set(key, state);
  }

  async get(key: string): Promise<OAuthState | null> {
    const state = this.states.get(key);
    if (!state) return null;

    // Check if state has expired
    if (Date.now() - state.createdAt > STATE_EXPIRATION_MS) {
      this.states.delete(key);
      return null;
    }

    return state;
  }

  async delete(key: string): Promise<void> {
    this.states.delete(key);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [key, state] of this.states.entries()) {
      if (now - state.createdAt > STATE_EXPIRATION_MS) {
        this.states.delete(key);
      }
    }
  }
}
