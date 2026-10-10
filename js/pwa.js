(function (root) {
  async function registerPwa({ onReady = () => {}, onUpdate = () => {}, onOffline = () => {} } = {}) {
    if (!('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const offerUpdate = worker => onUpdate(() => worker.postMessage('SKIP_WAITING'));
    if (registration.waiting) offerUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    addEventListener('offline', onOffline);
    await navigator.serviceWorker.ready;
    onReady(registration);
    return registration;
  }
  root.TSUKERUPwa = Object.freeze({ registerPwa });
})(globalThis);
