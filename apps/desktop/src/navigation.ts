export function allowedExternal(value: string, pendingOrigins: readonly string[] = []): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      pendingOrigins.includes(url.origin)
    );
  } catch {
    return false;
  }
}
export function allowedUI(value: string, origin: string): boolean {
  try {
    const target = new URL(value),
      expected = new URL(origin);
    return (
      expected.protocol === 'http:' &&
      expected.hostname === '127.0.0.1' &&
      !expected.username &&
      !expected.password &&
      target.origin === expected.origin &&
      !target.username &&
      !target.password
    );
  } catch {
    return false;
  }
}
