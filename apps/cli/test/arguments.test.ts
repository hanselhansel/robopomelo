import { expect,it } from 'vitest';
import { parseCommand, commandRegistry } from '../src/arguments.js';
it('parses explicit roots and bounded authorizations without side effects',()=>{
 const command=parseCommand(['patch','apply','change.json','--project','demo','--authorize','author,evidence','--json']);
 expect(command.name).toBe('patch apply');expect(command.positionals).toEqual(['change.json']);expect(command.scopes).toEqual(['author','evidence']);expect(command.flags.json).toBe(true);
});
it('uses browser open as the primary launch path',()=>{
 expect(parseCommand([]).name).toBe('open');
 expect(parseCommand(['open','demo','--no-browser']).flags['no-browser']).toBe(true);
});
it.each([{args:['unknown'],message:/Unknown command/},{args:['show','--unexpected'],message:/Unknown option/},{args:['show','--authorize','admin'],message:/authorization scope/},{args:['export','--all-evidence','--no-evidence'],message:/selection mode/}])('rejects ambiguous or unsupported input $args',({args,message})=>{
 expect(()=>parseCommand(args)).toThrow(message);
});
it('does not confuse input stdin with interactive wizard use',()=>{
 expect(parseCommand(['patch','check','-','--json']).positionals).toEqual(['-']);
 expect(()=>parseCommand(['plan','--json'])).toThrow(/interactive/);
});
it('registers all approved leaf commands and no hidden executable fallback',()=>{
 expect(commandRegistry.map(c=>c.name)).toContain('history restore');expect(commandRegistry.map(c=>c.name)).toContain('review approve');expect(commandRegistry.map(c=>c.name)).toContain('update configure');
 expect(new Set(commandRegistry.map(c=>c.name)).size).toBe(commandRegistry.length);
 for(const command of commandRegistry)expect(parseCommand([...command.name.split(' '),'--help']).help).toBe(true);
});
it('treats version as a Boolean query independent of command operands',()=>{
 expect(parseCommand(['--version']).version).toBe(true);
 expect(parseCommand(['update','install','1.0.0','--version']).version).toBe(true);
});
it('rejects a known flag on the wrong command',()=>{
 expect(()=>parseCommand(['show','--no-browser'])).toThrow(/flag/);
});
