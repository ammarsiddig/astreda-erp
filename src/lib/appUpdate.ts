type UpdateListener = (available: boolean) => void;

let waitingRegistration: ServiceWorkerRegistration | null = null;
const listeners = new Set<UpdateListener>();

function notify() {
  const available = !!waitingRegistration?.waiting;
  listeners.forEach((listener) => listener(available));
}

export function subscribeAppUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(!!waitingRegistration?.waiting);
  return () => {
    listeners.delete(listener);
  };
}

export function setWaitingRegistration(registration: ServiceWorkerRegistration | null) {
  waitingRegistration = registration?.waiting ? registration : null;
  notify();
}

export function activatePendingUpdate() {
  waitingRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}
