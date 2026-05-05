import { Client } from "basic-ftp";
import { Readable, Writable } from "stream";
import path from "path";

import { resolveRemotePath, toPosixPath } from "./pathUtils.js";

function isNotFoundFtpError(error) {
  // basic-ftp throws FTPError with numeric `code` for server responses.
  // 550 is the most common “not found / no access”.
  if (!error) return false;
  if (error.code === 550) return true;
  const msg = String(error.message || "");
  return msg.includes("550") || msg.toLowerCase().includes("not found");
}

function createWithClient({ host, port, user, password, secure }) {
  return async function withClient(fn) {
    const client = new Client();
    client.ftp.verbose = false;

    try {
      await client.access({
        host,
        port,
        user,
        password,
        secure
      });

      return await fn(client);
    } finally {
      client.close();
    }
  };
}

export function createFtpStorage({ backend, config, env = process.env }) {
  const host = config?.host || env.FTP_HOST || process.env.FTP_HOST;
  const user = config?.user || config?.username || env.FTP_USER || process.env.FTP_USER;
  const password = config?.password || env.FTP_PASSWORD || process.env.FTP_PASSWORD;

  if (!host || !user || !password) {
    throw new Error(
      "FTP backend requires host/user/password. Set FTP_HOST, FTP_USER, FTP_PASSWORD or provide them in the host provider config file."
    );
  }

  const port = config?.port
    ? Number(config.port)
    : env.FTP_PORT
      ? Number(env.FTP_PORT)
      : process.env.FTP_PORT
        ? Number(process.env.FTP_PORT)
        : 21;

  const secureRaw = String(config?.secure ?? env.FTP_SECURE ?? process.env.FTP_SECURE ?? "false").toLowerCase();
  const secure = secureRaw === "true" || secureRaw === "1" || secureRaw === "yes";

  const remoteRoot = config?.root || env.FTP_ROOT || process.env.FTP_ROOT || "/";
  const withClient = createWithClient({ host, port, user, password, secure });

  return {
    backend,

    async readFile(filePath, encoding) {
      const remotePath = resolveRemotePath(remoteRoot, filePath);
      const chunks = [];

      try {
        const content = await withClient(async (client) => {
          const writable = new Writable({
            write(chunk, _enc, cb) {
              chunks.push(Buffer.from(chunk));
              cb();
            }
          });

          await client.downloadTo(writable, remotePath);
          const buffer = Buffer.concat(chunks);
          return encoding ? buffer.toString(encoding) : buffer;
        });

        return content;
      } catch (error) {
        if (isNotFoundFtpError(error)) {
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

      const buffer = Buffer.isBuffer(data)
        ? data
        : Buffer.from(String(data), encoding || "utf8");

      return withClient(async (client) => {
        // Ensure directory exists (recursive)
        await client.ensureDir(remoteDir);
        // Move back to root dir after ensureDir (basic-ftp changes cwd)
        await client.cd("/");

        const readable = Readable.from([buffer]);
        await client.uploadFrom(readable, remotePath);
      });
    },

    async readdir(dirPath) {
      const remoteDir = resolveRemotePath(remoteRoot, dirPath);

      try {
        return await withClient(async (client) => {
          const list = await client.list(remoteDir);
          return list.map((e) => e.name);
        });
      } catch (error) {
        if (isNotFoundFtpError(error)) {
          const err = new Error(`ENOENT: no such file or directory, scandir '${remoteDir}'`);
          err.code = "ENOENT";
          throw err;
        }
        throw error;
      }
    },

    async stat(filePath) {
      const remotePath = resolveRemotePath(remoteRoot, filePath);
      const remoteDir = path.posix.dirname(toPosixPath(remotePath));
      const base = path.posix.basename(toPosixPath(remotePath));

      try {
        return await withClient(async (client) => {
          const list = await client.list(remoteDir);
          const entry = list.find((e) => e.name === base);
          if (!entry) {
            const err = new Error(`ENOENT: no such file or directory, stat '${remotePath}'`);
            err.code = "ENOENT";
            throw err;
          }

          // Normalize to a fs.Stats-ish subset used by code (size + mtime)
          return {
            size: entry.size,
            mtime: entry.modifiedAt || new Date(0)
          };
        });
      } catch (error) {
        if (error?.code === "ENOENT" || isNotFoundFtpError(error)) throw error;
        throw error;
      }
    },

    async mkdir(dirPath, options) {
      const remoteDir = resolveRemotePath(remoteRoot, dirPath);
      const recursive = options?.recursive !== false;
      if (!recursive) {
        // FTP doesn't have a non-recursive mkdir that fails neatly across providers;
        // best-effort ensureDir.
      }

      return withClient(async (client) => {
        await client.ensureDir(remoteDir);
      });
    },

    async unlink(filePath) {
      const remotePath = resolveRemotePath(remoteRoot, filePath);

      try {
        return await withClient(async (client) => {
          await client.remove(remotePath);
        });
      } catch (error) {
        if (isNotFoundFtpError(error)) {
          const err = new Error(`ENOENT: no such file or directory, unlink '${remotePath}'`);
          err.code = "ENOENT";
          throw err;
        }
        throw error;
      }
    }
  };
}
