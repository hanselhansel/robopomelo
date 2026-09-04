import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSource } from '../../packages/project-fs/src/yaml/parse.js';
import { editRecord, removeRecord } from '../../packages/project-fs/src/yaml/edit.js';
import { serializeSource } from '../../packages/project-fs/src/yaml/serialize.js';

const commentedSource = readFileSync(new URL('./fixtures/commented-deployment.yaml', import.meta.url), 'utf8');
describe('data-only preserving YAML', () => {
  it('changes only the stable-ID target and retains comments and scalar meanings', () => {
    const source = parseSource(commentedSource.replaceAll('\n', '\r\n'));
    const changed = editRecord(source, {collection:'needs', id:'need-1', field:'title', value:'Safe handoff'});
    const rendered = serializeSource(changed);
    expect(rendered).toContain('# vendor note');
    expect(rendered).toContain('# title note');
    expect(parseSource(rendered).value.extensions).toEqual({acme:{code:'001',flag:false,zero:0,missing:null}});
    expect((parseSource(rendered).value.needs as {title:string}[])[0]?.title).toBe('Safe handoff');
    expect((source.value.needs as {title:string}[])[0]?.title).toBe('Original');
  });
  it.each(['x: 1\nx: 2', 'x: &a [1]\ny: *a', 'x: &unused 1', 'x: !execute echo', 'x: !!str 1', 'x: {<<: {y: 1}}', '1: value', '? [x,y]\n: z', '__proto__: {}', 'x: {constructor: 1}', 'x: .inf', 'x: .nan', 'x: [', '---\nx: 1\n---\ny: 2'])('rejects unsafe input %s', text => {
    expect(() => parseSource(text)).toThrow();
  });
  it('reports a parser location without accepting malformed source', () => {
    expect(() => parseSource('x: [')).toThrow(expect.objectContaining({code:'YAML_INVALID', line:1}));
  });
  it('bounds bytes before parsing, depth and records', () => {
    expect(() => parseSource('x: '+ 'é'.repeat(4 * 1024 * 1024))).toThrow(expect.objectContaining({code:'LIMIT_EXCEEDED'}));
    expect(() => parseSource('x: '+ '['.repeat(65)+'0'+']'.repeat(65))).toThrow();
    expect(() => parseSource('records:\n'+Array.from({length:10001}, (_, i) => `- {id: r${i}}`).join('\n'))).toThrow();
    expect(() => parseSource(new Uint8Array([0xff]))).toThrow();
  });
  it('retains comments when removing a record, or returns a preservation conflict', () => {
    const source = parseSource('needs:\n- id: first\n  title: One # retain this\n- id: second\n  title: Two\n');
    expect(serializeSource(removeRecord(source, {collection:'needs',id:'first'}))).toContain('# retain this');
    expect(() => removeRecord(parseSource('needs:\n- id: first # only note\n'), {collection:'needs',id:'first'})).toThrow(expect.objectContaining({code:'PRESERVATION_CONFLICT'}));
  });
  it('rejects ambiguous IDs, missing targets, unsafe values and semantic serialization mismatch', () => {
    expect(() => editRecord(parseSource('needs: [{id: a}, {id: a}]'),{collection:'needs',id:'a',field:'title',value:'x'})).toThrow();
    expect(() => editRecord(parseSource('needs: []'),{collection:'needs',id:'missing',field:'title',value:'x'})).toThrow();
    expect(() => editRecord(parseSource(commentedSource),{collection:'needs',id:'need-1',field:'title',value:NaN})).toThrow();
    expect(() => serializeSource(parseSource('x: 1'), {x:2})).toThrow(expect.objectContaining({code:'SEMANTIC_MISMATCH'}));
  });
  it.each([undefined, new Date(), {a:undefined}, {a:Infinity}])('rejects non-JSON edit values without silently changing them', value => {
    expect(() => editRecord(parseSource(commentedSource), {collection:'needs',id:'need-1',field:'title',value:value as never})).toThrow();
  });
});
