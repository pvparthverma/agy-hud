import fs from "node:fs";
import path from "node:path";

export function branch(cwd: string): string {
  if (cwd === "") {
    return "";
  }
  let dir: string;
  try {
    dir = path.resolve(cwd);
  } catch {
    dir = cwd;
  }
  for (let i = 0; i < 8; i++) {
    const raw = readHEAD(dir);
    if (raw !== null) {
      return parseHEAD(raw.trim());
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return "";
}

function readHEAD(dir: string): string | null {
  const gitPath = path.join(dir, ".git");
  let stat: fs.Stats;
  try {
    stat = fs.statSync(gitPath);
  } catch {
    return null;
  }

  if (stat.isDirectory()) {
    try {
      return fs.readFileSync(path.join(gitPath, "HEAD"), "utf8");
    } catch {
      return null;
    }
  }

  let raw: string;
  try {
    raw = fs.readFileSync(gitPath, "utf8");
  } catch {
    return null;
  }
  let gitDir = parseGitDirFile(raw.trim());
  if (gitDir === "") {
    return null;
  }
  if (!path.isAbsolute(gitDir)) {
    gitDir = path.join(dir, gitDir);
  }
  if (!isUnsafeGitDir(dir) && isUnsafeGitDir(gitDir)) {
    return null;
  }
  try {
    return fs.readFileSync(path.join(gitDir, "HEAD"), "utf8");
  } catch {
    return null;
  }
}

// Reject Windows UNC/network paths (\\server\share, //server/share, \\?\..., \\.\...) and control
// characters so a crafted `.git` file in an untrusted repository cannot trigger outbound SMB
// connections or read device paths.
export function isUnsafeGitDir(gitDir: string): boolean {
  if (gitDir === "" || /\p{Cc}/u.test(gitDir)) {
    return true;
  }
  return /^[/\\]{2}/.test(gitDir);
}

function parseGitDirFile(raw: string): string {
  if (!raw.startsWith("gitdir:")) {
    return "";
  }
  const gitDir = raw.slice("gitdir:".length).trim();
  return isUnsafeGitDir(gitDir) ? "" : gitDir;
}

function parseHEAD(head: string): string {
  // Legitimate git refs and commit hashes never contain control or format characters; reject any
  // value carrying ESC/CSI/OSC/BEL, embedded newlines, or bidi overrides.
  if (head === "" || /[\p{Cc}\p{Cf}]/u.test(head)) {
    return "";
  }
  let name: string;
  if (head.startsWith("ref:")) {
    const ref = head.slice("ref:".length).trim();
    if (ref.startsWith("refs/heads/")) {
      name = ref.slice("refs/heads/".length);
    } else {
      name = path.basename(ref);
    }
  } else if (head.length > 7) {
    name = head.slice(0, 7);
  } else {
    name = head;
  }
  return name.length > 80 ? name.slice(0, 80) : name;
}
