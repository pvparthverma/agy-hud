import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { branch, isUnsafeGitDir } from "../src/gitinfo";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agy-hud-"));
}

test("branch from HEAD ref", () => {
  const repo = tempDir();
  fs.mkdirSync(path.join(repo, ".git"));
  fs.writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");

  assert.equal(branch(repo), "main");
});

test("branch from HEAD ref with subdirectories (slash)", () => {
  const repo = tempDir();
  fs.mkdirSync(path.join(repo, ".git"));
  fs.writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/feature/cool-stuff\n");

  assert.equal(branch(repo), "feature/cool-stuff");
});

test("detached HEAD and parent traversal", () => {
  const repo = tempDir();
  const child = path.join(repo, "a", "b");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.mkdirSync(child, { recursive: true });
  fs.writeFileSync(path.join(repo, ".git", "HEAD"), "abcdef1234567890\n");

  assert.equal(branch(child), "abcdef1");
});

test("branch from gitdir file", () => {
  const repo = tempDir();
  const gitDir = path.join(tempDir(), "actual-git-dir");
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(repo, ".git"), `gitdir: ${gitDir}\n`);
  fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/worktree-main\n");

  assert.equal(branch(repo), "worktree-main");
});

test("missing git dir returns empty branch", () => {
  assert.equal(branch(tempDir()), "");
});

test("relative basename falls back to process working directory", () => {
  const parent = tempDir();
  const repo = path.join(parent, "repo");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
  const old = process.cwd();
  process.chdir(repo);
  try {
    assert.equal(branch("repo"), "main");
  } finally {
    process.chdir(old);
  }
});

test("rejects UNC and device paths in gitdir file", () => {
  for (const dangerous of [
    "\\\\attacker.example\\share\\repo.git",
    "//attacker.example/share/repo.git",
    "\\\\?\\UNC\\attacker.example\\share",
    "\\\\.\\pipe\\evil",
    "C:\\repo\x00\\evil"
  ]) {
    assert.equal(isUnsafeGitDir(dangerous), true);
  }

  const repo = tempDir();
  fs.writeFileSync(path.join(repo, ".git"), "gitdir: \\\\127.0.0.1\\nonexistent-share\n");
  assert.equal(branch(repo), "");
});

test("rejects terminal escape sequences and control characters in HEAD", () => {
  for (const payload of [
    "ref: refs/heads/main\x1b]52;c;Zm9v\x07\n",
    "ref: refs/heads/\x1b[31mred\x1b[0m\n",
    "ref: refs/heads/feat\u202Eevil\n",
    "ref: refs/heads/line1\nline2\n"
  ]) {
    const repo = tempDir();
    fs.mkdirSync(path.join(repo, ".git"));
    fs.writeFileSync(path.join(repo, ".git", "HEAD"), payload);
    assert.equal(branch(repo), "");
  }
});
