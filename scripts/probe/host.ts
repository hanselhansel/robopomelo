import { cpus, platform, release, totalmem, arch } from 'node:os';
export const os = () => `${platform()} ${release()} ${arch()}`;
export const hardware = () => `${cpus()[0]?.model ?? 'unknown cpu'} x${cpus().length}, ${Math.round(totalmem() / 1073741824)} GiB`;
