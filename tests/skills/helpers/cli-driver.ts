import { ProjectService } from '../../../apps/cli/src/services/project.js';
import { parseCommand } from '../../../apps/cli/src/arguments.js';
import { executeCommand, resultEnvelope } from '../../../apps/cli/src/dispatch.js';
import { errorEnvelope, exitForError } from '../../../apps/cli/src/output.js';

async function main() {
  // Only this test driver injects the isolated config directory and version.
  const toolVersion = '1.0.0-rc.1';
  const project = new ProjectService({
    toolVersion,
    configDirectory: process.env.ROBOPOMELO_SKILL_TEST_CONFIG!,
  });
  let command = 'unknown';
  try {
    const parsed = parseCommand(process.argv.slice(2));
    command = parsed.name;
    const result = await executeCommand(parsed, {
      project,
      toolVersion,
      stdin: process.stdin,
      isTTY: false,
      cwd: process.cwd(),
    });
    process.stdout.write(JSON.stringify(resultEnvelope(command, result, toolVersion)));
    process.exitCode = result.exitCode ?? 0;
  } catch (error) {
    process.stdout.write(JSON.stringify(errorEnvelope(command, error, toolVersion)));
    process.exitCode = exitForError(error);
  } finally {
    await project.close();
  }
}
void main();
