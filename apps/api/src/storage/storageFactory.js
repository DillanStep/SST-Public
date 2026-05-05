import { createLocalStorage } from "./localStorage.js";
import { createFtpStorage } from "./ftpStorage.js";
import { createSftpStorage } from "./sftpStorage.js";
import { loadProviderConfig, selectProvider } from "../providerConfig.js";

export function createStorage(context = null) {
  const providerConfig = loadProviderConfig();
  const provider = context?.provider || selectProvider(providerConfig);
  const env = context?.env || process.env;

  const backend = (
    env.STORAGE_BACKEND ||
    provider?.backend ||
    "local"
  ).toLowerCase();

  if (backend === "ftp" || backend === "ftps") {
    const ftpConfig = provider?.ftp;
    return createFtpStorage({ backend, config: ftpConfig, env });
  }

  if (backend === "sftp") {
    const sftpConfig = provider?.sftp;
    return createSftpStorage({ backend, config: sftpConfig, env });
  }

  return createLocalStorage();
}
