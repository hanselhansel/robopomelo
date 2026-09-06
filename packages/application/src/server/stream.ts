import type { ServerResponse } from 'node:http';
export function waitForDrain(response: ServerResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', drained);
      response.off('close', closed);
      response.off('error', failed);
    };
    const drained = () => {
      cleanup();
      resolve();
    };
    const closed = () => {
      cleanup();
      reject(new Error('Download connection closed.'));
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    response.once('drain', drained);
    response.once('close', closed);
    response.once('error', failed);
    if (response.destroyed) closed();
  });
}
