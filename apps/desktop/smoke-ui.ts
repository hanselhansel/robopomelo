import type { BrowserWindow } from 'electron';
export async function waitForUi(window: BrowserWindow, predicate: string, timeoutMs = 10000) {
  await window.webContents.executeJavaScript(`new Promise((resolve,reject) => {
    const interval=setInterval(check,25);
    const timer=setTimeout(()=>{clearInterval(interval);reject(new Error('UI condition timed out'));},${timeoutMs});
    function check(){if(${predicate}){clearInterval(interval);clearTimeout(timer);resolve(true);}}
    check();
  })`);
}
export async function clickUi(window: BrowserWindow, label: string) {
  await window.webContents.executeJavaScript(`(()=>{
    const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(label)});
    if(!button||button.disabled)throw new Error('Button unavailable');button.focus();button.click();
  })()`);
}
export async function fillUi(window: BrowserWindow, selector: string, value: string) {
  await window.webContents.executeJavaScript(`(()=>{
    const field=document.querySelector(${JSON.stringify(selector)});
    if(!field)throw new Error('Field unavailable');
    const proto=field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(field,${JSON.stringify(value)});
    field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
}
export async function dropUiFile(window: BrowserWindow, path: string) {
  await window.webContents.executeJavaScript(`(()=>{const input=document.createElement('input');input.type='file';input.id='smoke-file';input.hidden=true;document.body.append(input);})()`);
  window.webContents.debugger.attach('1.3');
  try {
    const document = await window.webContents.debugger.sendCommand('DOM.getDocument');
    const { nodeId } = await window.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: document.root.nodeId, selector: '#smoke-file' });
    await window.webContents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: [path] });
    await window.webContents.executeJavaScript(`(()=>{
      const input=document.querySelector('#smoke-file'), transfer=new DataTransfer();
      transfer.items.add(input.files[0]);
      document.querySelector('.intake-dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));
      input.remove();
    })()`);
  } finally { window.webContents.debugger.detach(); }
}
export async function clickSelector(window: BrowserWindow, selector: string) {
  await window.webContents.executeJavaScript(`(()=>{
    const button=document.querySelector(${JSON.stringify(selector)});
    if(!button||button.disabled)throw new Error('Button unavailable: '+${JSON.stringify(selector)});button.focus();button.click();
  })()`);
}
