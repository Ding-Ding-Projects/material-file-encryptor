/** Approval-only reset with an invocation-bound page and authentication lifetime.
 * The supplied store remains the authority for protected-mode transitions. */
export function createSettingsResetWorkflow({store,host,requestConfirmation,translate=value=>value,isAuthenticated=()=>true,eventTarget}={}){
 let active=true,controller=new AbortController();const pending=new Set();
 const invalidate=()=>{controller.abort();controller=new AbortController();};
 eventTarget?.addEventListener('pagehide',invalidate);
 return {invalidate,invalidatePending(){if(pending.size)invalidate();},
  async reset(){
   if(!requestConfirmation)throw Error('The settings reset confirmation adapter is unavailable.');
   invalidate();const signal=controller.signal;
   const validate=()=>{if(!active||signal.aborted||!isAuthenticated())throw Error('The settings reset was cancelled. Unlock the profile and try again.');};
   validate();pending.add(signal);let approval;try{approval=await requestConfirmation(host,{action:translate('Reset local preferences'),affected:translate('Language, appearance, attention and local schedule preferences'),translate,signal,confirmationOnly:true,validateConfirmation:validate});}finally{pending.delete(signal);}
   if(!approval?.confirmed)return {confirmed:false};validate();
   const result=store.reset();return {confirmed:true,result};
  },
  destroy(){if(!active)return;active=false;controller.abort();eventTarget?.removeEventListener('pagehide',invalidate);},
 };
}
export const SETTINGS_RESET_COPY={
 'The settings reset confirmation adapter is unavailable.':'設定重設確認服務目前無法使用。',
 'The settings reset was cancelled. Unlock the profile and try again.':'設定重設已取消，請解鎖設定檔再重試。',
 'Reset local preferences':'重設本機偏好設定',
 'Language, appearance, attention and local schedule preferences':'語言、外觀、專注及本機時間表偏好設定',
};
