import { checkedParserRequest } from './parser-contracts.js';
import { decodeAttachment } from './parser-decode.js';

let acceptedPort = false;
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.data?.type !== 'robopomelo:parser-port' || acceptedPort) return;
  const port = event.ports[0];
  if (!port || event.ports.length !== 1) return;
  acceptedPort = true;
  let received = false;
  port.onmessage = async (message: MessageEvent) => {
    if (received) return;
    received = true;
    try {
      const request = checkedParserRequest(message.data);
      const response = await decodeAttachment(request);
      // MessagePortMain does not deserialize DOM ArrayBuffer transfer lists.
      // Clone the bounded (at most 6 MiB) preview bytes across this boundary.
      port.postMessage(response);
    } catch {
      // Invalid transport input cannot supply a trusted job identity. The host
      // owns the finite timeout and returns a sanitized terminal failure.
    } finally {
      port.close();
    }
  };
  port.start();
});
