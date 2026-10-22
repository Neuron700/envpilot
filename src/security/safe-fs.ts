import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;

export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafePathError";
  }
}

export class FileTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileTooLargeError";
  }
}

export class ProjectFileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFileNotFoundError";
  }
}

export function resolveProjectPath(root: string, relativePath: string): string {
  if (relativePath.includes("\0")) {
    throw new UnsafePathError("Path contains a null byte.");
  }

  const absoluteRoot = path.resolve(root);
  const target = path.isAbsolute(relativePath)
    ? path.resolve(relativePath)
    : path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, target);

  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new UnsafePathError(`Path escapes the project root: ${relative || "."}`);
  }

  return target;
}

function displayPath(root: string, target: string): string {
  const relative = path.relative(path.resolve(root), target);
  return relative === "" ? "." : relative;
}

async function assertRealPathInsideRoot(root: string, target: string): Promise<void> {
  const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
  const relative = path.relative(realRoot, realTarget);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new UnsafePathError(
      `Resolved path escapes the project root: ${displayPath(root, target)}`,
    );
  }
}

export async function projectFileExists(root: string, relativePath: string): Promise<boolean> {
  let target: string;
  try {
    target = resolveProjectPath(root, relativePath);
  } catch {
    return false;
  }

  try {
    const info = await lstat(target);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

export interface ReadProjectFileOptions {
  maxBytes?: number;
}

export async function readProjectFile(
  root: string,
  relativePath: string,
  options: ReadProjectFileOptions = {},
): Promise<string> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_FILE_BYTES;
  const target = resolveProjectPath(root, relativePath);

  let linkInfo;
  try {
    linkInfo = await lstat(target);
  } catch {
    throw new ProjectFileNotFoundError(`Project file was not found: ${relativePath}`);
  }

  if (linkInfo.isSymbolicLink()) {
    throw new UnsafePathError(`Symbolic links are not read: ${relativePath}`);
  }
  if (!linkInfo.isFile()) {
    throw new UnsafePathError(`Path is not a regular file: ${relativePath}`);
  }
  if (linkInfo.size > maxBytes) {
    throw new FileTooLargeError(
      `Project file is too large (${linkInfo.size} bytes, limit ${maxBytes}): ${relativePath}`,
    );
  }

  await assertRealPathInsideRoot(root, target);

  const info = await stat(target);
  if (!info.isFile()) {
    throw new UnsafePathError(`Path is not a regular file: ${relativePath}`);
  }

  return readFile(target, "utf8");
}
