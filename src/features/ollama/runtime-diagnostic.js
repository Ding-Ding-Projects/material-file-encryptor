const stages=new Set(['runtime-inventory','environment','writable-directories','process-start','job-create','job-configure','process-create','job-assign','process-identity','process-resume','process-exit','api-readiness']);
const categories=new Set(['native-call','access','data','io','argument','state','unknown','native-exit','readiness-timeout']);
// Only fixed categories and numeric native results cross the host boundary.
export function runtimeDiagnostic(value){
 if(!value||typeof value!=='object'||!stages.has(value.stage)||!categories.has(value.category))return null;
 const nativeCode=['native-call','native-exit'].includes(value.category)&&Number.isInteger(value.nativeCode)&&value.nativeCode>=-2147483648&&value.nativeCode<=(value.category==='native-exit'?0xffffffff:2147483647)?value.nativeCode:null;
 return Object.freeze({stage:value.stage,category:value.category,nativeCode});
}
