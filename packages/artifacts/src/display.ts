import type { ProjectSnapshot, ReviewSection } from '@robopomelo/spec';
export function html(text:string):string{return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
export function markdown(text:string):string{return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_[\]#|]/g,'\\$&');}
export function provenance(s:ProjectSnapshot):string{return `Source revision: ${s.sourceRevision}\nSource SHA-256: ${s.sourceHash}\nPlanning SHA-256: ${s.planningHash}\nRoboPomelo: ${s.validation.toolVersion}\nSpecification: ${s.deployment.specVersion}\nRule set: ${s.validation.ruleSetVersion}\n${s.validation.label}\nOperator decision status: ${s.approvalStatus}`;}
export function sectionMarkdown(section:ReviewSection):string{
 const rows=section.records.map(record=>`### ${markdown(record.title)}\n\nRecord: ${markdown(record.id)}\n\n${record.fields.map(field=>`**${markdown(field.label)}:** ${markdown(field.value)}`).join('\n\n')}`);
 return `## ${markdown(section.title)}\n\n${rows.length?rows.join('\n\n'):'None recorded.'}`;
}
