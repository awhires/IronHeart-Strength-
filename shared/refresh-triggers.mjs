// Refresh the authenticated snapshot when the page becomes visible, when a
// native Capacitor app resumes, and periodically while its UI is in front.
export function attachRefreshTriggers({isNative=false,app,document,window,refresh,shouldRefresh=()=>true,intervalMs=30000}){
 let active=true,nativeActive=true,nativeHandle;
 const refreshSnapshot=()=>{
  if(!active||!shouldRefresh()||isNative&&!nativeActive)return;
  Promise.resolve(refresh()).catch(()=>{});
 };
 const refreshIfVisible=()=>{if(document.visibilityState==='visible')refreshSnapshot();};
 document.addEventListener('visibilitychange',refreshIfVisible);
 window.addEventListener('focus',refreshIfVisible);
 window.addEventListener('pageshow',refreshIfVisible);
 const timer=setInterval(refreshIfVisible,intervalMs);
 if(isNative&&app){
  Promise.resolve(app.addListener('appStateChange',state=>{
   nativeActive=!!state.isActive;
   if(nativeActive)refreshSnapshot();
  })).then(handle=>{if(active)nativeHandle=handle;else handle?.remove?.();}).catch(()=>{});
 }
 return ()=>{
  active=false;clearInterval(timer);
  document.removeEventListener('visibilitychange',refreshIfVisible);
  window.removeEventListener('focus',refreshIfVisible);
  window.removeEventListener('pageshow',refreshIfVisible);
  nativeHandle?.remove?.();
 };
}
