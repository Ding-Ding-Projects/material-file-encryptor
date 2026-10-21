// Readiness describes completion of existing work, never runtime health or trust.
export const MODEL_STARTUP_NOT_STARTED=Object.freeze({schemaVersion:1,state:'not-started',initialization:'not-started',inspection:'not-started',pendingRequests:0,pendingOperations:0});
const validCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=65535;

export function createModelStartupReadiness() {
 let generation=0,initialization='not-started',inspection='not-started',inspectionTicket=null;
 return {
  reset(){generation++;initialization='not-started';inspection='not-started';inspectionTicket=null;},
  beginInitialization(){generation++;initialization='pending';inspection='not-started';inspectionTicket=null;return generation;},
  finishInitialization(ticket,succeeded){if(ticket===generation&&initialization==='pending')initialization=succeeded===true?'settled':'failed';},
  beginInspection(){
   if(initialization!=='settled'||!['not-started','failed'].includes(inspection))return null;
   inspection='pending';inspectionTicket=Symbol('runtime-inspection');return inspectionTicket;
  },
  finishInspection(ticket,succeeded){if(ticket!==null&&ticket===inspectionTicket&&inspection==='pending'){inspection=succeeded===true?'settled':'failed';inspectionTicket=null;}},
  snapshot(pendingRequests=0,pendingOperations=0){
   const countsValid=validCount(pendingRequests)&&validCount(pendingOperations);
   const state=!countsValid||initialization==='failed'||inspection==='failed'?'failed':initialization==='not-started'?'not-started':initialization!=='settled'||inspection!=='settled'||pendingRequests>0||pendingOperations>0?'pending':'settled';
   return {schemaVersion:1,state,initialization,inspection,pendingRequests:countsValid?pendingRequests:null,pendingOperations:countsValid?pendingOperations:null};
  },
 };
}
