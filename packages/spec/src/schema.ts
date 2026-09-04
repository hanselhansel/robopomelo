import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { schemas } from './schema-registry.js';
export { schemas } from './schema-registry.js';

export type SchemaKind = 'deployment' | 'patch' | 'review';
const ajv = new Ajv2020({strict:true, allErrors:true, ownProperties:true});
for (const schema of schemas) ajv.addSchema(schema);
const schemaNames: Record<SchemaKind, string> = {
  deployment:'deployment-1.0.0', patch:'patch-1.0.0', review:'review-command-1.0.0',
};
const validators = Object.fromEntries(Object.entries(schemaNames).map(([kind,name]) => {
  const validate = ajv.getSchema(`https://robopomelo.dev/schemas/${name}.schema.json`);
  if (!validate) throw new Error(`Bundled schema unavailable: ${name}`);
  return [kind,validate];
})) as Record<SchemaKind, ValidateFunction>;

/** Structural validation only. All references are preloaded, with no remote resolver. */
export function checkSchema(input: unknown, kind: SchemaKind = 'deployment'): ErrorObject[] {
  const validate = validators[kind];
  if (validate(input)) return [];
  return (validate.errors ?? []).map(error => ({...error,params:{...error.params}}));
}
