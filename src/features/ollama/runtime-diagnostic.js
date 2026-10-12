const stages=new Set(['runtime-inventory','environment','writable-directories','process-start','job-create','job-configure','process-create','job-assign','process-identity','process-resume']);
const categories=new Set(['native-call','access','data','io','argument','state','unknown']);
// Only fixed categories and numeric native results cross the host boundary.
export function runtimeDiagnostic(value){
 if(!value||typeof value!=='object'||!stages.has(value.stage)||!categories.has(value.category))return null;
 const nativeCode=value.category==='native-call'&&Number.isInteger(value.nativeCode)&&value.nativeCode>=-2147483648&&value.nativeCode<=2147483647?value.nativeCode:null;
 return Object.freeze({stage:value.stage,category:value.category,nativeCode});
}
