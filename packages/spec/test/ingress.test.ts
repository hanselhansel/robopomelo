import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { checkSchema, schemas } from '../src/index.js';
import { blank } from './fixtures.js';

const schemaBase = 'https://raw.githubusercontent.com/hanselhansel/robopomelo/v1.0.0/packages/spec/schemas/';
function nested(depth: number): object {
  let value: object = {leaf:null};
  for (let i=0;i<depth;i++) value = {child:value};
  return value;
}
function limit(input: unknown, expected: string): void {
  let errors: ReturnType<typeof checkSchema> = [];
  expect(() => { errors = checkSchema(input); }).not.toThrow();
  expect(errors).toEqual([expect.objectContaining({keyword:'inputLimit',instancePath:expect.any(String),schemaPath:'#/inputLimits',params:expect.objectContaining({limit:expected})})]);
}

describe('schema identities', () => {
  it('uses unique repository-controlled version-qualified identities', () => {
    expect(new Set(schemas.map(schema => schema.$id)).size).toBe(schemas.length);
    for (const schema of schemas) expect(schema.$id.startsWith(schemaBase)).toBe(true);
  });
  it('resolves every reference synchronously from the local bundle', () => {
    const ajv = new Ajv2020({strict:true,validateFormats:false});
    for (const schema of schemas) ajv.addSchema(schema);
    for (const schema of schemas) expect(ajv.getSchema(schema.$id)).toBeTypeOf('function');
    expect(ajv.getSchema(schemaBase+'deployment-1.0.0.schema.json')?.(blank)).toBe(true);
  });
});

describe('calendar-aware timestamp validation', () => {
  it.each(['2026-13-05T00:00:00Z','2026-04-31T00:00:00Z','2026-09-05T24:00:00Z','2026-09-05T00:00:00+24:00','2025-02-29T00:00:00Z'])('rejects impossible timestamp %s', updatedAt => {
    expect(checkSchema({...blank,meta:{...blank.meta,updatedAt}}).length).toBeGreaterThan(0);
  });
  it.each(['2024-02-29T12:34:56.123456Z','2026-09-05T00:00:00+05:30','2026-09-05T00:00:00-08:00'])('accepts timestamp %s', updatedAt => {
    expect(checkSchema({...blank,meta:{...blank.meta,updatedAt}})).toEqual([]);
  });
});

describe('bounded schema ingress', () => {
  it('rejects excessive depth before invoking recursive validation', () => {
    limit({...blank,extensions:{acme:nested(65)}},'depth');
  });
  it('rejects cyclic input without throwing a RangeError', () => {
    const cycle: Record<string,unknown> = {};
    cycle.self=cycle;
    limit({...blank,extensions:{acme:cycle}},'cycle');
  });
  it('does not mistake reused objects for cycles', () => {
    const shared = {zero:0,flag:false,items:[null,'001']};
    expect(checkSchema({...blank,extensions:{acme:{first:shared,second:shared}}})).toEqual([]);
  });
  it('rejects excessive record counts', () => {
    const stakeholders = Array.from({length:10_001},(_,index) => ({id:'person-'+index}));
    limit({...blank,stakeholders},'records');
  });
  it('bounds even a flat extension made only of scalar nodes', () => {
    limit({...blank,extensions:{acme:Array(100_001).fill(null)}},'nodes');
  });
  it('bounds sparse arrays before Ajv can expand undefined items', () => {
    limit({...blank,extensions:{acme:Array(100_001)}},'nodes');
  });
  it('accepts exactly 64 container levels and rejects the next level', () => {
    expect(checkSchema({...blank,extensions:{acme:nested(61)}})).toEqual([]);
    limit({...blank,extensions:{acme:nested(62)}},'depth');
  });
  it('permits ordinary nested extension data', () => {
    expect(checkSchema({...blank,extensions:{acme:nested(20)}})).toEqual([]);
  });
});
