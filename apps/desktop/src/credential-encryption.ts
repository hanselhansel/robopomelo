/** Main-process only. Never export this provider through preload or HTTP. */
export interface EncryptionProvider {
  isAvailable():Promise<boolean>;
  encrypt(plaintext:string):Promise<Buffer>;
  decrypt(ciphertext:Buffer):Promise<{result:string; shouldReEncrypt:boolean}>;
}
export class CredentialError extends Error {
  constructor(readonly code:'CREDENTIAL_INVALID'|'CREDENTIAL_NOT_FOUND'|'CREDENTIAL_STORAGE_UNAVAILABLE'|'CREDENTIAL_ENCRYPTION_UNAVAILABLE') {
    super(code === 'CREDENTIAL_ENCRYPTION_UNAVAILABLE' ? 'Credential encryption is unavailable. Retry when secure storage is available.' : 'Credential operation failed.');
    this.name = 'CredentialError';
  }
}
export function credentialError(error:unknown):CredentialError {
  if (error instanceof CredentialError) return error;
  if (error && typeof error === 'object' && 'isTemporarilyUnavailable' in error && error.isTemporarilyUnavailable === true) return new CredentialError('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
  return new CredentialError('CREDENTIAL_STORAGE_UNAVAILABLE');
}
type AsyncSafeStorage = Pick<Electron.SafeStorage,'isAsyncEncryptionAvailable'|'encryptStringAsync'|'decryptStringAsync'>;
/** Construct after app.whenReady(). Injecting safeStorage avoids a runtime import
 * in unit tests. This factory never calls Keychain at construction time. */
export function createMacOSEncryptionProvider(storage:AsyncSafeStorage,platform:NodeJS.Platform = process.platform):EncryptionProvider {
  const isAvailable = async () => {
    try {return platform === 'darwin' && await storage.isAsyncEncryptionAvailable();}
    catch (error) {throw credentialError(error);}
  };
  const secured = async <T>(action:()=>Promise<T>):Promise<T> => {
    try {
      if (!await isAvailable()) throw new CredentialError('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
      return await action();
    } catch (error) {throw credentialError(error);}
  };
  return {
    isAvailable,
    encrypt:plaintext => secured(() => storage.encryptStringAsync(plaintext)),
    decrypt:ciphertext => secured(() => storage.decryptStringAsync(ciphertext)),
  };
}
