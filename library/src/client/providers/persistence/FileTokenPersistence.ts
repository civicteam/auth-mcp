import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { TokenPersistence } from "./TokenPersistence.js";

/**
 * File-based token persistence strategy
 * Tokens are stored in a JSON file on disk
 */
export class FileTokenPersistence implements TokenPersistence {
  constructor(private filePath: string) {}

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    try {
      // Ensure the directory exists
      await fs.mkdir(dirname(this.filePath), { recursive: true });

      // Write tokens to file
      await fs.writeFile(this.filePath, JSON.stringify(tokens, null, 2), "utf8");
    } catch (error) {
      console.error("Failed to save tokens to file:", error);
      throw error;
    }
  }

  async loadTokens(): Promise<OAuthTokens | undefined> {
    try {
      const data = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(data) as OAuthTokens;
    } catch (error) {
      // File doesn't exist or can't be read - return undefined
      console.debug("Failed to load tokens from file:", error);
      return undefined;
    }
  }

  async clearTokens(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      // File doesn't exist - ignore error
      console.debug("Failed to clear tokens file (may not exist):", error);
    }
  }
}
