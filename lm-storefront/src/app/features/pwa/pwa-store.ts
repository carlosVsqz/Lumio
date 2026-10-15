import { Injectable, DestroyRef, afterNextRender, inject, isDevMode, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface InstallPrompt extends Event {
  prompt():Promise<void>;
  userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}

@Injectable({providedIn:'root'})
export class PwaStore {
  private readonly updates=inject(SwUpdate);
  private prompt:InstallPrompt|null=null;
  private checking=false;
  readonly supported=signal(false);
  readonly installed=signal(false);
  readonly canInstall=signal(false);
  readonly installing=signal(false);
  readonly installHelp=signal(false);
  readonly offline=signal(false);
  readonly updateReady=signal(false);
  readonly notice=signal('');

  constructor() {
    const destroy=inject(DestroyRef);
    afterNextRender(()=>{
      this.supported.set(!isDevMode() && window.isSecureContext && 'serviceWorker' in navigator);
      this.offline.set(!navigator.onLine);
      const display=window.matchMedia('(display-mode: standalone)');
      const installed=()=>this.installed.set(display.matches || (navigator as Navigator & {standalone?:boolean}).standalone===true);
      installed();display.addEventListener('change',installed);
      const beforeInstall=(event:Event)=>{
        event.preventDefault();this.prompt=event as InstallPrompt;this.canInstall.set(true);
      };
      const appInstalled=()=>{this.prompt=null;this.installed.set(true);this.canInstall.set(false);this.installHelp.set(false);this.notice.set('Aplicación instalada.');};
      const connection=()=>{this.offline.set(!navigator.onLine);if(navigator.onLine)void this.checkUpdate();};
      const visible=()=>{if(document.visibilityState==='visible')void this.checkUpdate();};
      window.addEventListener('beforeinstallprompt',beforeInstall);
      window.addEventListener('appinstalled',appInstalled);
      window.addEventListener('online',connection);window.addEventListener('offline',connection);
      document.addEventListener('visibilitychange',visible);
      this.updates.versionUpdates.pipe(takeUntilDestroyed(destroy)).subscribe(event=>{
        if(event.type==='VERSION_READY')this.updateReady.set(true);
      });
      this.updates.unrecoverable.pipe(takeUntilDestroyed(destroy)).subscribe(()=>{
        this.updateReady.set(true);this.notice.set('Es necesario recargar la aplicación para continuar con la versión disponible.');
      });
      destroy.onDestroy(()=>{
        display.removeEventListener('change',installed);
        window.removeEventListener('beforeinstallprompt',beforeInstall);window.removeEventListener('appinstalled',appInstalled);
        window.removeEventListener('online',connection);window.removeEventListener('offline',connection);
        document.removeEventListener('visibilitychange',visible);
      });
    });
  }
  async install() {
    const prompt=this.prompt;
    if(!prompt || this.installing()){this.installHelp.set(true);return;}
    this.installing.set(true);this.notice.set('');
    try {
      await prompt.prompt();
      const outcome=(await prompt.userChoice).outcome;
      if(outcome==='accepted')this.installHelp.set(false);
    } catch {this.installHelp.set(true);this.notice.set('No se pudo abrir la instalación. Usa el menú de tu navegador.');}
    finally {this.prompt=null;this.canInstall.set(false);this.installing.set(false);}
  }
  reload() { window.location.reload(); }
  private async checkUpdate() {
    if(this.checking || !this.updates.isEnabled || !navigator.onLine)return;
    this.checking=true;
    try {await this.updates.checkForUpdate();} catch { /* Keep the current version and local selection when offline/updating. */ }
    finally {this.checking=false;}
  }
}
