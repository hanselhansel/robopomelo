import type { ProjectSnapshot, ReviewDocument } from '@robopomelo/spec';
import { markdown, provenance, sectionMarkdown } from '../display.js';
function document(title:string,doc:ReviewDocument,s:ProjectSnapshot,ids?:string[]):string{
 const sections=ids?doc.sections.filter(section=>ids.includes(section.id)):doc.sections;
 return `# ${markdown(title)}\n\n${provenance(s)}\n\n${sections.map(sectionMarkdown).join('\n\n')}\n`;
}
export function brief(doc:ReviewDocument,s:ProjectSnapshot):string{return document(doc.title,doc,s);}
export function acceptance(doc:ReviewDocument,s:ProjectSnapshot):string{return document(`${doc.title}: acceptance plan`,doc,s,['acceptanceTests','evidence','readiness','review','review-acknowledgments','review-waivers','review-revocations','review-invalidations'])+'\nThese are planned tests and evidence requirements. No test execution or result assessment is recorded by RoboPomelo v1.\n';}
export function handoff(doc:ReviewDocument,s:ProjectSnapshot):string{
 return document(`${doc.title}: engineering handoff`,doc,s,['project','needs','problems','workflows','kpis','requirements','risks','assumptions','challenges','acceptanceTests','readiness'])+`\n## Inputs for the next engineering stage\n\nUse deployment.yaml as the structured intent and acceptance-plan.md as the planned verification contract. The readable review preserves unresolved needs, problems, challenges, risks and assumptions.\n\nBefore setting up Isaac Sim, Gazebo or another engineering environment, identify the facility geometry and coordinate frame, robot and load assets, controller and integration configuration, scenario inputs, and target platform/version. Resolve or explicitly carry forward the unknowns shown above. Map the planned criteria to observations in that environment.\n\nThis package is an engineering input. It contains no runnable simulation, robot commands, facility-system connection or generated performance result. Test execution and result assessment belong to a later version.\n`;
}
