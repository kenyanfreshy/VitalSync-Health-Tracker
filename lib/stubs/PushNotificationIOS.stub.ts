/**
 * Safe PushNotificationIOS stub for iOS New Architecture / Expo Go.
 *
 * ROOT CAUSE:
 * `react-native/Libraries/PushNotificationIOS/PushNotificationIOS.js` calls:
 *
 *   new NativeEventEmitter(NativePushNotificationManagerIOS)
 *
 * at MODULE EVALUATION TIME (not inside a function). On iOS New Architecture
 * without the PushNotificationManager native pod linked (e.g. Expo managed
 * workflow, Expo Go), `NativePushNotificationManagerIOS` is `null` because
 * `TurboModuleRegistry.get('PushNotificationManager')` returns null.
 *
 * React Native's `NativeEventEmitter` constructor throws a fatal invariant
 * when called with null on iOS:
 *
 *   Invariant Violation: `new NativeEventEmitter()` requires a non-null argument.
 *
 * This crash fires BEFORE React mounts, BEFORE GlobalErrorBoundary is active,
 * and BEFORE any component renders — it is a Dead-on-Arrival crash.
 *
 * THE FIX:
 * Metro resolver redirects any require() of PushNotificationIOS to this stub
 * on iOS. The stub provides the same API surface but never calls
 * `new NativeEventEmitter()`.
 *
 * All methods are safe no-ops. Notification functionality is provided by
 * `expo-notifications` via `lib/notifications/safe-notifications.ts`.
 *
 * RCA Reference: VitalSync crash logs 2026-04-28 (7 identical fatal entries).
 */

// Safe no-op class that mirrors the PushNotificationIOS API surface
// without calling new NativeEventEmitter() at module load time.
class SafePushNotificationIOS {
  static addEventListener(_type: string, _handler: unknown): void {}
  static removeEventListener(_type: string, _handler: unknown): void {}
  static requestPermissions(_permissions?: unknown): Promise<unknown> {
    return Promise.resolve({ alert: false, badge: false, sound: false });
  }
  static abandonPermissions(): void {}
  static checkPermissions(_callback: (permissions: unknown) => void): void {
    _callback({ alert: false, badge: false, sound: false });
  }
  static getInitialNotification(): Promise<null> {
    return Promise.resolve(null);
  }
  static setApplicationIconBadgeNumber(_number: number): void {}
  static getApplicationIconBadgeNumber(_callback: (num: number) => void): void {
    _callback(0);
  }
  static cancelAllLocalNotifications(): void {}
  static cancelLocalNotifications(_userInfo: unknown): void {}
  static getScheduledLocalNotifications(
    _callback: (notifications: unknown[]) => void,
  ): void {
    _callback([]);
  }
  static scheduleLocalNotification(_details: unknown): void {}
  static presentLocalNotification(_details: unknown): void {}
  static addNotificationRequest(_request: unknown): void {}
  static removeAllPendingNotificationRequests(): void {}
  static removePendingNotificationRequests(_identifiers: string[]): void {}
  static getDeliveredNotifications(
    _callback: (notifications: unknown[]) => void,
  ): void {
    _callback([]);
  }
  static removeDeliveredNotifications(_identifiers: string[]): void {}
  static removeAllDeliveredNotifications(): void {}
  static finish(_fetchResult: unknown): void {}

  getMessage(): unknown {
    return null;
  }
  getSound(): unknown {
    return null;
  }
  getAlert(): unknown {
    return null;
  }
  getCategory(): unknown {
    return null;
  }
  getData(): unknown {
    return {};
  }
  getBadgeCount(): number {
    return 0;
  }
  getThreadID(): unknown {
    return null;
  }
  finish(_fetchResult: unknown): void {}
}

export default SafePushNotificationIOS;
