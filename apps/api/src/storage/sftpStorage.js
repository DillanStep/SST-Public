import SftpClient from "ssh2-sftp-client";
import path from "path";

import { resolveRemotePath, toPosixPath } from "./pathUtils.js";

function isNotFoundSftpError(error) {
  if (!error) return false;
  const code = String(error.code || "").toUpperCase();
  if (code === "ENOENT") return true;
  const msg = String(error.message || "").toLowerCase();
  return msg.includes("no such file") || msg.includes("not exist") || msg.includes("enoent");
}

async function withClient(connectOptions, fn) {
  const client = new SftpClient();
  try {
    await client.connect(connectOptions);
    return await fn(client);
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

export function createSftpStorage({ backend, config, env = process.env }) {
  const host = config?.host || env.SFTP_HOST || process.env.SFTP_HOST;
  const username = config?.user || config?.username || env.SFTP_USER || process.env.SFTP_USER;
  const password = config?.password || env.SFTP_PASSWORD || process.env.SFTP_PASSWORD;

  if (!host || !username || !password) {
    throw new Error(
      "SFTP backend requires host/user/password. Set SFTP_HOST, SFTP_USER, SFTP_PASSWORD or provide them in the host provider config file."
    );
  }

  const port = config?.port ? Number(config.port) : env.SFTP_PORT ? Number(env.SFTP_PORT) : process.env.SFTP_PORT ? Number(process.env.SFTP_PORT) : 22;
  const remoteRoot = config?.root || env.SFTP_ROOT || process.env.SFTP_ROOT || "/";

  const connectOptions = {
    host,
    port,
    username,
    password,
    readyTimeout: 20000,    // 20 seconds to establish connection
    retries: 1,             // Don't retry on failure
    retry_factor: 1,
    retry_minTimeout: 1000,
  };

  return {
    backend,

    async readFile(filePath, encoding) {
      const remotePath = resolveRemotePath(remoteRoot, filePath);
      try {
        const buffer = await withClient(connectOptions, (client) => client.get(remotePath));
        // ssh2-sftp-client get() can return Buffer
        if (encoding) return Buffer.from(buffer).toString(encoding);
        return Buffer.from(buffer);
      } catch (error) {
        if (isNotFoundSftpError(error)) {
          const err = new Error(`ENOENT: no such file or directory, open '${remotePath}'`);
          err.code = "ENOENT";
          throw err;
        }
        throw error;
      }
    },

    async writeFile(filePath, data, encoding) {
      const remotePath = resolveRemotePath(remoteRoot, filePath);
      const remoteDir = path.posix.dirname(toPosixPath(remotePath));

      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), encoding || "utf8");

      return withClient(connectOptions, async (client) => {
        await client.mkdir(remoteDir, true);
        await client.put(buffer, remotePath);
      });
    },

    async readdir(dirPath) {
      const remoteDir = resolveRemotePath(remoteRoot, dirPath);
      try {
        return await withClient(connectOptions, async (client) => {
          const list = await client.list(remoteDir);
          return list.map((e) => e.name);
        });
      } catch (error) {
        if (isNotFoundSftpError(error)) {
          const err = new Error(`ENOENT: no such file or directory, scandir '${remoteDir}'`);
          err.code = "ENOENT";
          throw err;
        }
        throw error;
      }
    },

    async stat(filePath) {
      const remotePath = resolveRemotePath(remoteRoot, filePath);
      try {
        return await withClient(connectOptions, async (client) => {
          const s = await client.stat(remotePath);
          return {
            size: s.size,
            mtime: s.modifyTime ? new Date(s.modifyTime) : new Date(0)
          };
        });
      } catch (error) {
        if (isNotFoundSftpError(error)) {
          const err = new Error(`ENOENT: no such file or directory, stat '${remotePath}'`);
          err.code = "ENOENT";
          throw err;
        }
        throw error;
      }
    },

    async mkdir(dirPath, options) {
      const remoteDir = resolveRemotePath(remoteRoot, dirPath);
      const recursive = options?.recursive !== false;

      return withClient(connectOptions, async (client) => {
        await client.mkdir(remoteDir, recursive);
      });
    },

    async unlink(filePath) {
      const remotePath = resolveRemotePath(remoteRoot, filePath);
      try {
        return await withClient(connectOptions, async (client) => {
          await client.delete(remotePath);
        });
      } catch (error) {
        if (isNotFoundSftpError(error)) {
          const err = new Error(`ENOENT: no such file or directory, unlink '${remotePath}'`);
          err.code = "ENOENT";
          throw err;
        }
        throw error;
      }
    }
  };
}
