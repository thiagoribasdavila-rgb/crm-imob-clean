import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function acquireLock(lockPath) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = openSync(lockPath, "wx", 0o600);
      writeFileSync(handle, `${process.pid}\n`);
      closeSync(handle);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const ownerPid = Number(readFileSync(lockPath, "utf8").trim());
      if (processIsAlive(ownerPid)) throw new Error(`Outra execução Atlas está ativa (PID ${ownerPid}). Aguarde antes de iniciar build ou dev.`);
      rmSync(lockPath, { force: true });
    }
  }
  throw new Error("Não foi possível adquirir a trava de rotas do Atlas.");
}

export function createRouteQuarantine({ root, paths, mode }) {
  const lockPath = join(root, ".atlas-route-quarantine.lock");
  const quarantineRoot = join(root, `.atlas-route-quarantine-${mode}-${process.pid}`);
  const moved = [];
  let restored = false;

  acquireLock(lockPath);

  function move(relativePath) {
    const source = join(root, relativePath);
    if (!existsSync(source)) return;
    const target = join(quarantineRoot, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(source, target);
    moved.push({ source, target });
  }

  function restore() {
    if (restored) return;
    restored = true;
    for (const { source, target } of moved.reverse()) {
      if (!existsSync(target)) continue;
      mkdirSync(dirname(source), { recursive: true });
      renameSync(target, source);
    }
    rmSync(quarantineRoot, { recursive: true, force: true });
    rmSync(lockPath, { force: true });
  }

  try {
    paths.forEach(move);
  } catch (error) {
    restore();
    throw error;
  }

  return { restore, movedCount: moved.length };
}
