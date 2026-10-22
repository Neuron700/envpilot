import { symlink } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readProjectFile, UnsafePathError } from "../src/security/safe-fs";
import { makeProject, removeProject } from "./helpers";

describe("safe filesystem access", () => {
  it("rejects paths that escape the project root", async () => {
    const root = await makeProject({ "package.json": "{}" });
    try {
      await expect(readProjectFile(root, "../outside.txt")).rejects.toBeInstanceOf(
        UnsafePathError,
      );
      await expect(
        readProjectFile(root, path.resolve(root, "..", "outside.txt")),
      ).rejects.toBeInstanceOf(UnsafePathError);
    } finally {
      await removeProject(root);
    }
  });

  it("does not expose absolute paths when a link escapes the project", async () => {
    const root = await makeProject({ "keep.txt": "keep" });
    const outside = await makeProject({ ".env": "SECRET=value" });
    try {
      await symlink(
        outside,
        path.join(root, "linked"),
        process.platform === "win32" ? "junction" : "dir",
      );

      let message = "";
      try {
        await readProjectFile(root, "linked/.env");
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toMatch(/escapes the project root/i);
      expect(message).not.toContain(root);
      expect(message).not.toContain(outside);
    } finally {
      await removeProject(root);
      await removeProject(outside);
    }
  });

  it("enforces a maximum file size", async () => {
    const root = await makeProject({ "big.txt": "12345678901" });
    try {
      await expect(readProjectFile(root, "big.txt", { maxBytes: 10 })).rejects.toThrow(
        /too large/i,
      );
    } finally {
      await removeProject(root);
    }
  });

  it("reads a normal project file", async () => {
    const root = await makeProject({ ".env.example": "API_KEY=\n" });
    try {
      await expect(readProjectFile(root, ".env.example")).resolves.toContain("API_KEY");
    } finally {
      await removeProject(root);
    }
  });
});

