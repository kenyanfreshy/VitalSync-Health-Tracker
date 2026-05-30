/**
 * VitalSync Global Error Boundary
 *
 * This is the outermost React error boundary — it wraps the entire app tree,
 * including ThemeProvider, SafeAreaProvider, and all context providers.
 * Any unhandled render error anywhere in the tree is caught here.
 *
 * Responsibilities:
 *  1. Catch render errors that would otherwise produce a blank/white screen.
 *  2. Log the full error + component stack to the local crash store (AsyncStorage).
 *  3. Show a branded recovery UI with the error message and component trace.
 *  4. Offer "Try Again" (reset boundary state) and "Restart App" (via expo-updates).
 *
 * Placement: wrap the absolute root of the app in app/_layout.tsx, outside
 * every other provider so no provider crash escapes unhandled.
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { logCrash } from '@/lib/crash-logger';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
  componentStack: string;
  errorId: string;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      errorStack: '',
      componentStack: '',
      errorId: '',
    };
  }

  // ─── React lifecycle ────────────────────────────────────────────────────────

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'An unexpected error occurred.',
      errorStack: error?.stack?.slice(0, 1500) ?? '',
      errorId: `ERR-${Date.now().toString(36).toUpperCase()}`,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const componentStack = info?.componentStack ?? '';

    // Capture the component stack into state for display
    this.setState({ componentStack: componentStack.slice(0, 1200) });

    // Log to console immediately (visible in Metro / Xcode logs)
    console.error('[VitalSync] ★ GLOBAL ERROR BOUNDARY caught a render error ★');
    console.error('  Message :', error?.message);
    console.error('  Stack   :', error?.stack?.slice(0, 800));
    console.error('  Component tree:\n', componentStack.slice(0, 600));

    // Persist to local crash log asynchronously — never blocks the UI
    logCrash({
      type: 'RenderError',
      message: `[GlobalBoundary] ${error?.message ?? 'Unknown render error'}`,
      stack: error?.stack,
      componentStack: info?.componentStack ?? undefined,
    }).catch(() => {/* swallow — logging must never cause a secondary crash */});

  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  handleTryAgain = () => {
    this.setState({
      hasError: false,
      errorMessage: '',
      errorStack: '',
      componentStack: '',
      errorId: '',
    });
  };

  handleRestart = async () => {
    // expo-updates.reloadAsync() performs a full JS bundle reload without
    // requiring a native restart. Falls back gracefully in dev / web.
    try {
      if (Platform.OS !== 'web') {
        const Updates = await import('expo-updates');
        await Updates.reloadAsync();
      } else {
        // On web, reload the page
        if (typeof window !== 'undefined') window.location.reload();
      }
    } catch (_unused) {
      // If reload fails (e.g. dev mode), just reset the boundary state
      this.handleTryAgain();
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { errorMessage, errorStack, componentStack, errorId } = this.state;

    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.iconWrap}>
            <Text style={styles.iconText}>⚠️</Text>
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            VitalSync encountered an unexpected error. Your health data is safe on this
            device. Tap <Text style={styles.bold}>Try Again</Text> to recover, or{' '}
            <Text style={styles.bold}>Restart App</Text> for a full reload.
          </Text>

          {/* Error ID badge */}
          <View style={styles.idBadge}>
            <Text style={styles.idText}>Error ID: {errorId}</Text>
          </View>

          {/* Error message */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ERROR MESSAGE</Text>
            <ScrollView
              style={styles.codeBox}
              horizontal={false}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.codeText}>{errorMessage}</Text>
            </ScrollView>
          </View>

          {/* JS stack trace */}
          {!!errorStack && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>JS STACK TRACE</Text>
              <ScrollView
                style={[styles.codeBox, styles.codeBoxTall]}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.codeText}>{errorStack}</Text>
              </ScrollView>
            </View>
          )}

          {/* Component stack */}
          {!!componentStack && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>COMPONENT TREE</Text>
              <ScrollView
                style={[styles.codeBox, styles.codeBoxTall]}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.codeText}>{componentStack}</Text>
              </ScrollView>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
              onPress={this.handleTryAgain}
            >
              <Text style={styles.btnPrimaryText}>Try Again</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
              onPress={this.handleRestart}
            >
              <Text style={styles.btnSecondaryText}>Restart App</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>
            Error details are saved to Settings → Diagnostics for review.
          </Text>
        </ScrollView>
      </View>
    );
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  iconWrap: {
    marginBottom: 12,
  },
  iconText: {
    fontSize: 52,
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#9BA1A6',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 16,
    maxWidth: 340,
  },
  bold: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  idBadge: {
    backgroundColor: '#1A2640',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  idText: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
  },
  section: {
    width: '100%',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 1,
    marginBottom: 6,
  },
  codeBox: {
    backgroundColor: '#060D1A',
    borderRadius: 10,
    padding: 12,
    maxHeight: 90,
    borderWidth: 1,
    borderColor: '#1E2D45',
  },
  codeBoxTall: {
    maxHeight: 130,
  },
  codeText: {
    fontSize: 11,
    color: '#F87171',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
    width: '100%',
    maxWidth: 340,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: '#22C55E',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: '#1A2640',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D3F5C',
  },
  btnSecondaryText: {
    color: '#9BA1A6',
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  hint: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
});
