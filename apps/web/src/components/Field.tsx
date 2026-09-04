import type {Deployment,FieldDefinition,Json,Knowledge,Quantity,Criterion,FlowStep,FlowException,VerificationDeclaration} from '@robopomelo/spec';
import {KnowledgeField} from './KnowledgeField.js';
import {StringList,TextInput} from './ui.js';
import {References,referenceOptions} from './References.js';
import {FlowSteps,FlowExceptions} from './FlowFields.js';
import {Verification} from './Verification.js';
export function Field({definition:f,id,value,deployment,onChange,onView}:{definition:FieldDefinition;id:string;value:unknown;deployment:Deployment;onChange:(v:Json)=>void;onView?:(id:string)=>void}){const change=(v:unknown)=>onChange(v as Json);const controlId=`${id}-${f.path}`;let control;
 if(f.inputKind.startsWith('knowledge-'))control=<KnowledgeField id={controlId} label={f.label} value={(value??null) as Knowledge<string|Quantity|Criterion>} kind={f.inputKind.slice(10) as 'text'|'id'|'quantity'|'criterion'} options={referenceOptions(deployment,f.referenceTarget??'stakeholders')} onChange={change}/>;
 else if(f.inputKind==='reference-list')control=<References id={controlId} label={f.label} value={(value??[]) as string[]} options={referenceOptions(deployment,f.referenceTarget??'needs')} onChange={change} {...(onView?{onView}:{})}/>;
 else if(f.inputKind==='string-list')control=<StringList id={controlId} label={f.label} value={(value??[]) as string[]} onChange={change}/>;
 else if(f.inputKind==='flow-steps')control=<FlowSteps id={controlId} value={(value??[]) as FlowStep[]} onChange={change} deployment={deployment}/>;
 else if(f.inputKind==='flow-exceptions')control=<FlowExceptions id={controlId} value={(value??[]) as FlowException[]} onChange={change} deployment={deployment}/>;
 else if(f.inputKind==='verification')control=<Verification id={controlId} collection={f.collection} value={(value??[]) as VerificationDeclaration[]} onChange={change} deployment={deployment}/>;
 else if(f.inputKind==='boolean')control=<label className="check-row"><input id={controlId} type="checkbox" checked={value===true} onChange={e=>change(e.target.checked)}/>{f.label}</label>;
 else if(f.inputKind==='enum')control=<><label htmlFor={controlId}>{f.label}</label><select id={controlId} value={String(value??'')} onChange={e=>change(e.target.value)}>{f.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></>;
 else control=<TextInput id={controlId} label={f.label} value={String(value??'')} multiline={f.inputKind==='multiline'} onChange={change}/>;
 return <div className="field-group" data-field={f.path}>{control}<p className="help">{f.help}</p></div>;
}
