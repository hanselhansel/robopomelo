// @vitest-environment jsdom
import {it,expect,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {useState} from 'react';
import type {Knowledge,Quantity} from '@robopomelo/spec';
import {KnowledgeField} from '../src/components/KnowledgeField.js';
afterEach(cleanup);
it('keeps an explicit unknown distinct from a zero quantity',()=>{function Form(){const[v,set]=useState<Knowledge<Quantity>>(null);return <KnowledgeField id="baseline" label="Baseline" value={v} onChange={set} kind="quantity"/>;}render(<Form/>);fireEvent.change(screen.getByLabelText('Baseline state'),{target:{value:'unknown'}});expect(screen.queryByLabelText('Value')).toBeNull();expect(screen.getByLabelText('What is unknown?')).toBeTruthy();});
it('preserves value until replacing knowledge state is explicitly confirmed',()=>{function Form(){const[v,set]=useState<Knowledge<string>>({state:'provided',value:'Keep this observation'});return <KnowledgeField id="observation" label="Observation" value={v} onChange={set} kind="text"/>;}render(<Form/>);fireEvent.change(screen.getByLabelText('Observation state'),{target:{value:'not-applicable'}});expect(screen.getByText('Keep this observation',{selector:'pre'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Keep current value'}));expect(screen.getByLabelText('Observation value')).toHaveProperty('value','Keep this observation');});
