export const INSTALL_SUGGESTION_KEY='lumio.pwa.suggestion.v1';
export const INSTALL_SUGGESTION_COOLDOWN=30*24*60*60*1000;

export function suggestionDismissed(raw:string|null,now:number):boolean {
  if(!raw || raw.length>200)return false;
  try {
    const value=JSON.parse(raw);
    return value?.version===1 && Number.isSafeInteger(value.dismissedAt) && value.dismissedAt>0
      && value.dismissedAt<=now && now-value.dismissedAt<INSTALL_SUGGESTION_COOLDOWN;
  } catch {return false;}
}

export function dismissInstallSuggestion(storage:Pick<Storage,'setItem'>|null,now:number):void {
  try {storage?.setItem(INSTALL_SUGGESTION_KEY,JSON.stringify({version:1,dismissedAt:now}));}
  catch { /* Dismissing still works in this tab if storage is blocked. */ }
}
