/**
 * undo-toast-context.ts
 *
 * Safe stub — prevents "Unable to resolve module @/lib/undo-toast-context"
 * build failures if any file imports this module.
 *
 * Replace the body of `showUndo` with a real toast/snackbar implementation
 * when the undo-toast UI feature is built out.
 */

export const useUndoToast = () => {
  return {
    /**
     * Display an undo prompt to the user.
     * @param message  Human-readable description of the action that can be undone.
     * @param action   Optional callback invoked when the user taps "Undo".
     */
    showUndo: (message: string, action?: () => void) => {
      // Stub: log to console until a real toast component is wired up.
      console.log('[UndoToast]', message);
      if (action) action();
    },
  };
};
