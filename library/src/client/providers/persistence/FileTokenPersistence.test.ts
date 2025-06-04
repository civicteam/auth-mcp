import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileTokenPersistence } from "./FileTokenPersistence.js";

describe("FileTokenPersistence", () => {
  const mockTokens: OAuthTokens = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    id_token: "test-id-token",
    token_type: "Bearer" as const,
    expires_in: 3600,
    scope: "read write",
  };

  let tempDir: string;
  let testFilePath: string;
  let persistence: FileTokenPersistence;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = await fs.mkdtemp(join(tmpdir(), "file-token-persistence-test-"));
    testFilePath = join(tempDir, "tokens.json");
    persistence = new FileTokenPersistence(testFilePath);
  });

  afterEach(async () => {
    // Clean up the temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe("constructor", () => {
    it("should create instance with file path", () => {
      const filePath = "/path/to/tokens.json";
      const instance = new FileTokenPersistence(filePath);
      expect(instance).toBeInstanceOf(FileTokenPersistence);
    });
  });

  describe("saveTokens", () => {
    it("should save tokens to file successfully", async () => {
      await persistence.saveTokens(mockTokens);

      // Verify file exists and contains correct data
      const fileContent = await fs.readFile(testFilePath, "utf8");
      const savedTokens = JSON.parse(fileContent);
      expect(savedTokens).toEqual(mockTokens);
    });

    it("should create directory if it doesn't exist", async () => {
      const nestedPath = join(tempDir, "nested", "deep", "tokens.json");
      const nestedPersistence = new FileTokenPersistence(nestedPath);

      await nestedPersistence.saveTokens(mockTokens);

      // Verify directory was created
      const dirExists = await fs
        .stat(dirname(nestedPath))
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);

      // Verify file was created with correct content
      const fileContent = await fs.readFile(nestedPath, "utf8");
      const savedTokens = JSON.parse(fileContent);
      expect(savedTokens).toEqual(mockTokens);
    });

    it("should overwrite existing file", async () => {
      // Save initial tokens
      await persistence.saveTokens(mockTokens);

      // Save new tokens
      const newTokens: OAuthTokens = {
        access_token: "new-access-token",
        token_type: "Bearer",
      };
      await persistence.saveTokens(newTokens);

      // Verify new tokens are saved
      const fileContent = await fs.readFile(testFilePath, "utf8");
      const savedTokens = JSON.parse(fileContent);
      expect(savedTokens).toEqual(newTokens);
    });

    it("should throw error for invalid file path", async () => {
      // Use a path that cannot be written to (e.g., a directory that doesn't exist and can't be created)
      const invalidPath = "/invalid/path/that/cannot/be/created/tokens.json";
      const invalidPersistence = new FileTokenPersistence(invalidPath);

      await expect(invalidPersistence.saveTokens(mockTokens)).rejects.toThrow();
    });

    it("should format JSON with proper indentation", async () => {
      await persistence.saveTokens(mockTokens);

      const fileContent = await fs.readFile(testFilePath, "utf8");
      // Verify it's properly formatted (contains newlines and spaces)
      expect(fileContent).toContain("\n");
      expect(fileContent).toContain("  ");
      expect(JSON.parse(fileContent)).toEqual(mockTokens);
    });
  });

  describe("loadTokens", () => {
    it("should load tokens from existing file", async () => {
      // First save tokens
      await persistence.saveTokens(mockTokens);

      // Then load them
      const loadedTokens = await persistence.loadTokens();
      expect(loadedTokens).toEqual(mockTokens);
    });

    it("should return undefined for non-existent file", async () => {
      const nonExistentPath = join(tempDir, "non-existent.json");
      const nonExistentPersistence = new FileTokenPersistence(nonExistentPath);

      const loadedTokens = await nonExistentPersistence.loadTokens();
      expect(loadedTokens).toBeUndefined();
    });

    it("should return undefined for invalid JSON file", async () => {
      // Write invalid JSON to file
      await fs.writeFile(testFilePath, "invalid json content", "utf8");

      const loadedTokens = await persistence.loadTokens();
      expect(loadedTokens).toBeUndefined();
    });

    it("should handle empty file", async () => {
      // Create empty file
      await fs.writeFile(testFilePath, "", "utf8");

      const loadedTokens = await persistence.loadTokens();
      expect(loadedTokens).toBeUndefined();
    });

    it("should handle file with only whitespace", async () => {
      // Create file with only whitespace
      await fs.writeFile(testFilePath, "   \n  \t  ", "utf8");

      const loadedTokens = await persistence.loadTokens();
      expect(loadedTokens).toBeUndefined();
    });
  });

  describe("clearTokens", () => {
    it("should delete existing token file", async () => {
      // First save tokens
      await persistence.saveTokens(mockTokens);

      // Verify file exists
      const existsBefore = await fs
        .stat(testFilePath)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(true);

      // Clear tokens
      await persistence.clearTokens();

      // Verify file is deleted
      const existsAfter = await fs
        .stat(testFilePath)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });

    it("should not throw error for non-existent file", async () => {
      const nonExistentPath = join(tempDir, "non-existent.json");
      const nonExistentPersistence = new FileTokenPersistence(nonExistentPath);

      // Should not throw
      await expect(nonExistentPersistence.clearTokens()).resolves.toBeUndefined();
    });
  });

  describe("file path validation", () => {
    it("should handle absolute paths correctly", async () => {
      const absolutePath = join(tempDir, "absolute", "tokens.json");
      const absolutePersistence = new FileTokenPersistence(absolutePath);

      await absolutePersistence.saveTokens(mockTokens);
      const loadedTokens = await absolutePersistence.loadTokens();
      expect(loadedTokens).toEqual(mockTokens);
    });

    it("should handle paths with special characters", async () => {
      const specialPath = join(tempDir, "special-chars_test.tokens.json");
      const specialPersistence = new FileTokenPersistence(specialPath);

      await specialPersistence.saveTokens(mockTokens);
      const loadedTokens = await specialPersistence.loadTokens();
      expect(loadedTokens).toEqual(mockTokens);
    });

    it("should handle deeply nested directory structure", async () => {
      const deepPath = join(tempDir, "a", "b", "c", "d", "e", "tokens.json");
      const deepPersistence = new FileTokenPersistence(deepPath);

      await deepPersistence.saveTokens(mockTokens);

      // Verify all directories were created
      const dirExists = await fs
        .stat(dirname(deepPath))
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);

      const loadedTokens = await deepPersistence.loadTokens();
      expect(loadedTokens).toEqual(mockTokens);
    });
  });

  describe("concurrent operations", () => {
    it("should handle multiple save operations", async () => {
      const promises = [];

      // Start multiple save operations concurrently
      for (let i = 0; i < 5; i++) {
        const tokens = { ...mockTokens, access_token: `token-${i}` };
        promises.push(persistence.saveTokens(tokens));
      }

      // Wait for all to complete
      await Promise.all(promises);

      // File should exist and contain valid JSON
      const loadedTokens = await persistence.loadTokens();
      expect(loadedTokens).toBeDefined();
      expect(loadedTokens?.token_type).toBe("Bearer");
    });
  });

  describe("error handling", () => {
    it("should throw descriptive error when directory creation fails", async () => {
      // Try to create a file where a directory should be created but can't
      // This is platform-specific, so we'll mock the fs.mkdir to simulate failure
      const originalMkdir = fs.mkdir;
      fs.mkdir = () => Promise.reject(new Error("Permission denied"));

      try {
        await expect(persistence.saveTokens(mockTokens)).rejects.toThrow();
      } finally {
        // Restore original function
        fs.mkdir = originalMkdir;
      }
    });
  });
});
