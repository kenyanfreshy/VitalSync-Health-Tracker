/**
 * VitalSync Error Boundary
 * Catches unhandled React render errors and shows a recovery screen
 * instead of a white/blank crash screen.
 *
 * Apple App Store review requires that apps handle errors gracefully
 * rather than showing a blank screen or crashing silently.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { logCrash } from '@/lib/crash-logger';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[VitalSync] Unhandled render error:', error, info);
    // Persist to local crash log (no server/cloud required)
    logCrash({
      type: 'RenderError',
      message: error?.message ?? 'Unknown render error',
      stack: error?.stack,
      componentStack: info?.componentStack ?? undefined,
    }).catch(() => {/* swallow */});

  }

  handleRestart = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.body}>
              VitalSync encountered an unexpected error. Your health data is safe — tap the button
              below to try again.
            </Text>
            <ScrollView style={styles.errorBox} showsVerticalScrollIndicator={false}>
              <Text style={styles.errorText}>{this.state.errorMessage}</Text>
            </ScrollView>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
              onPress={this.handleRestart}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1A2640',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: 16,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#9BA1A6',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorBox: {
    backgroundColor: '#0D1117',
    borderRadius: 10,
    padding: 12,
    maxHeight: 100,
    width: '100%',
  },
  errorText: {
    fontSize: 12,
    color: '#F87171',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#1A73E8',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
