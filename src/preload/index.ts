import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('quarrix', {
  call: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (fn: (event: string, data: unknown) => void) => {
    const h = (_: unknown, event: string, data: unknown) => fn(event, data);
    ipcRenderer.on('event', h);
    return () => ipcRenderer.removeListener('event', h);
  },
  platform: process.platform,
});
