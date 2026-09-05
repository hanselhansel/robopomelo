import type { Readable } from 'node:stream';
import type { Finding, ProjectSnapshot } from '@robopomelo/spec';
import type { ParsedCommand } from '../arguments.js';
import type { ProjectService } from '../services/project.js';
import type { UpdateService } from '../runtime/update.js';
export interface CommandResult {
  data: unknown;
  snapshot?: ProjectSnapshot;
  exitCode?: number;
  ok?: boolean;
  findings?: Finding[];
  sourceRevision?: string | null;
  sourceHash?: string | null;
  specVersion?: string | null;
}
export interface CommandContext {
  project: ProjectService;
  toolVersion: string;
  stdin: Readable;
  isTTY: boolean;
  cwd?: string;
  updater?: UpdateService;
  packageDirectory?: string;
  open?: CommandHandler;
  plan?: CommandHandler;
}
export type CommandHandler = (command: ParsedCommand, context: CommandContext) => Promise<CommandResult>;
