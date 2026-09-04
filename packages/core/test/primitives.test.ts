import { describe, it, expect } from 'vitest';
import { compareQuantities, decimalToFraction } from '../src/quantities.js';
import { canonicalJson } from '../src/canonical.js';
import { hasValue, knowledgeText } from '../src/knowledge.js';
import { buildReferenceIndex } from '../src/references.js';
import { sha256 } from '../src/hash.js';

describe('exact quantities', () => {
  it.each([
    ['12', 'in', '1', 'ft'], ['1000', 'g', '1', 'kg'],
    ['1', 'lb', '0.45359237', 'kg'], ['60', 'count/min', '3600', 'count/h'],
    ['50', '%', '0.5', 'ratio'], ['1', 'ft/s', '0.3048', 'm/s'],
  ])('compares %s %s and %s %s exactly', (a, au, b, bu) => {
    expect(compareQuantities({value:a,unit:au,subject:'same'}, {value:b,unit:bu,subject:'same'})).toBe(0);
  });
  it('does not conflate subjects or dimensions', () => {
    expect(() => compareQuantities({value:'1',unit:'count',subject:'pallet'}, {value:'1',unit:'count',subject:'tote'})).toThrow(/subject/);
    expect(() => compareQuantities({value:'1',unit:'m',subject:'load'}, {value:'1',unit:'kg',subject:'load'})).toThrow(/dimension/);
    expect(() => compareQuantities({value:'1',unit:'custom',subject:'load'}, {value:'1',unit:'custom',subject:'load'})).toThrow(/unit/);
  });
  it('retains sign and precision without floating point', () => {
    expect(decimalToFraction('-0.125')).toEqual({numerator:-1n,denominator:8n});
    expect(compareQuantities({value:'9007199254740993',unit:'count',subject:'load'}, {value:'9007199254740992',unit:'count',subject:'load'})).toBe(1);
  });
  it.each(['1e3','NaN','Infinity','','.1','1.',' 1','0x10','1'.repeat(129)])('rejects invalid bounded decimal %s', value => {
    expect(() => decimalToFraction(value)).toThrow(/decimal/);
  });
});
describe('knowledge and canonical primitives', () => {
  it('retains false and zero as supplied values', () => {
    expect(hasValue({state:'provided',value:false})).toBe(true);
    expect(hasValue({state:'unverified',value:0})).toBe(true);
    expect(hasValue({state:'unknown',note:'Not measured'})).toBe(false);
    expect(knowledgeText(null)).toBe('Missing');
    expect(knowledgeText({state:'not-applicable',reason:'No lift'})).toContain('No lift');
    expect(knowledgeText({state:'unverified',value:'20'})).toContain('Unverified');
  });
  it('sorts object keys but retains array order and arbitrary extension arrays', () => {
    expect(canonicalJson({z:0,a:false})).toBe('{"a":false,"z":0}');
    expect(canonicalJson(['b','a'])).toBe('["b","a"]');
    expect(() => canonicalJson({bad:NaN})).toThrow();
  });
  it('hashes canonical UTF8 with a known SHA256 vector', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('indexes nested domain IDs but never traverses extension payloads', () => {
    const index=buildReferenceIndex({project:{id:'project-1'},workflows:[{id:'flow-1',steps:[{id:'step-1'}],extensions:{acme:{id:'step-1'}}}]} as never);
    expect(index.get('step-1')?.collection).toBe('workflows');
    expect(index.size).toBe(3);
    expect(() => buildReferenceIndex({needs:[{id:'same'}],workflows:[{id:'same'}]} as never)).toThrow(/Duplicate/);
  });
});
