/**
 * App Events — lightweight synchronous event bus for cross-component communication.
 *
 * Used to trigger actions that live in a parent layout from a child screen
 * (e.g., opening the What's New sheet from the Settings screen while the
 * sheet state lives in the Tabs layout).
 *
 * Usage:
 *   // Emit (from Settings screen):
 *   appEvents.emit('openWhatsNew');
 *
 *   // Subscribe (from Tabs layout):
 *   useEffect(() => {
 *     const unsub = appEvents.on('openWhatsNew', () => setShowWhatsNew(true));
 *     return unsub;
 *   }, []);
 */

type AppEventMap = {
  openWhatsNew: void;
  medReminderDismissed: void;
};

type Listener<T> = T extends void ? () => void : (payload: T) => void;

class AppEventBus {
  private listeners: Partial<{ [K in keyof AppEventMap]: Listener<AppEventMap[K]>[] }> = {};

  on<K extends keyof AppEventMap>(event: K, listener: Listener<AppEventMap[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as Listener<AppEventMap[K]>[]).push(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof AppEventMap>(event: K, listener: Listener<AppEventMap[K]>): void {
    const arr = this.listeners[event] as Listener<AppEventMap[K]>[] | undefined;
    if (!arr) return;
    this.listeners[event] = arr.filter((l) => l !== listener) as typeof arr;
  }

  emit<K extends keyof AppEventMap>(
    event: K,
    ...args: AppEventMap[K] extends void ? [] : [AppEventMap[K]]
  ): void {
    const arr = this.listeners[event] as ((...a: unknown[]) => void)[] | undefined;
    if (!arr) return;
    for (const listener of arr) {
      listener(...(args as unknown[]));
    }
  }
}

export const appEvents = new AppEventBus();
