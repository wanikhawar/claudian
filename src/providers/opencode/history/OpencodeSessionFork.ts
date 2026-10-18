import { readOpencodeHTTPMessages } from '../http/OpencodeHTTPHistory';
import { type OpencodeServerLease, type OpencodeServerService, withOpencodeServerLease } from '../http/OpencodeServerService';

export interface OpencodeSessionForkOptions {
  resolveServerService?: () => Promise<OpencodeServerService | null | undefined>;
  cliPath: string;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  sourceSessionId: string;
  resumeAt?: string;
}

/** Fork immediately so subsequent source turns cannot enter the child's context. */
export async function forkOpencodeSession(options: OpencodeSessionForkOptions): Promise<string> {
  return withOpencodeServerLease(await options.resolveServerService?.(), options.cliPath, options.cwd, options.environment, client => (
    forkOpencodeHTTPSession(client, options.sourceSessionId, options.resumeAt)
  ));
}

/** Fork before the next native entry so the selected assistant reply is retained. */
export async function forkOpencodeHTTPSession(client: OpencodeServerLease, sourceSessionId: string, resumeAt?: string): Promise<string> {
  let before: string | undefined;
  if (resumeAt) {
    const messages = await readOpencodeHTTPMessages(client, sourceSessionId);
    const index = messages.findIndex(message => message.id === resumeAt && message.type === 'assistant');
    if (index === -1) throw new Error('OpenCode fork checkpoint not found. Reload the conversation and try again.');
    // The native boundary is exclusive; retain the selected assistant reply.
    const next = messages[index + 1];
    if (next) {
      if (typeof next.id !== 'string' || !next.id.trim()) throw new Error('OpenCode fork boundary has an invalid message ID.');
      before = next.id;
    }
  }
  const child = await client.request<{ data: { id: string } }>(`/api/session/${encodeURIComponent(sourceSessionId)}/fork`, { method: 'POST', body: before ? { before } : {} });
  if (typeof child.data?.id !== 'string' || !child.data.id.trim() || child.data.id === sourceSessionId) throw new Error('OpenCode fork returned an invalid child session.');
  return child.data.id;
}
