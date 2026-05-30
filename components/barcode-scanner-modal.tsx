/**
 * BarcodeScannerModal
 *
 * A full-screen modal that uses expo-camera's native barcode scanning
 * to read EAN-13, UPC-A, QR, and other barcode formats on-device.
 *
 * On scan: calls onBarcode(barcodeValue) and closes automatically.
 * No server call — barcode reading happens entirely on-device.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useFoodCameraStrings } from '@/hooks';

interface Props {
  visible: boolean;
  onBarcode: (barcode: string) => void;
  onClose: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FINDER_SIZE = Math.min(SCREEN_W * 0.7, 280);

export function BarcodeScannerModal({ visible, onBarcode, onClose }: Props) {
  const fc = useFoodCameraStrings();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const lastBarcode = useRef<string>('');

  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned || data === lastBarcode.current) return;
      lastBarcode.current = data;
      setScanned(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onBarcode(data);
    },
    [scanned, onBarcode],
  );

  const handleClose = useCallback(() => {
    setScanned(false);
    lastBarcode.current = '';
    onClose();
  }, [onClose]);

  const handleRescan = useCallback(() => {
    setScanned(false);
    lastBarcode.current = '';
  }, []);

  if (!visible) return null;

  // Permission not yet determined
  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
        <View style={styles.center}>
          <Text style={styles.msgText}>{fc.requestingCameraPermission ?? 'Requesting camera permission…'}</Text>
        </View>
      </Modal>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
        <View style={styles.center}>
          <Text style={styles.msgText}>{fc.cameraAccessRequired ?? 'Camera access required to scan barcodes.'}</Text>
          <TouchableOpacity style={styles.btn} onPress={requestPermission}>
            <Text style={styles.btnText}>{fc.grantPermission ?? 'Grant Permission'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handleClose}>
            <Text style={styles.btnTextSecondary}>{fc.cancelLabel ?? 'Cancel'}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13', 'ean8', 'upc_a', 'upc_e',
              'code128', 'code39', 'code93',
              'qr', 'datamatrix', 'pdf417',
            ],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        />

        {/* Dark overlay with finder cutout */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.finder}>
              {/* Corner brackets */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {/* Scan line */}
              <View style={styles.scanLine} />
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{fc.scanBarcodeTitle ?? 'Scan Barcode'}</Text>
          <View style={styles.closeBtn} />
        </View>

        {/* Hint text */}
        <View style={styles.hintContainer} pointerEvents="none">
          <Text style={styles.hintText}>
            {scanned ? (fc.barcodeDetected ?? 'Barcode detected!') : (fc.pointCameraAtBarcode ?? 'Point camera at a product barcode')}
          </Text>
          {scanned && (
            <TouchableOpacity style={styles.rescanBtn} onPress={handleRescan}>
              <Text style={styles.rescanText}>{fc.scanAgain ?? 'Scan Again'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const OVERLAY_COLOR = 'rgba(0,0,0,0.6)';
const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;
const CORNER_COLOR = '#00E5CC';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  msgText: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 24 },
  btn: {
    backgroundColor: '#00E5CC',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    minWidth: 180,
    alignItems: 'center',
  },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#555' },
  btnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  btnTextSecondary: { color: '#aaa', fontWeight: '600', fontSize: 15 },

  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: OVERLAY_COLOR },
  overlayMiddle: { flexDirection: 'row', height: FINDER_SIZE },
  overlaySide: { flex: 1, backgroundColor: OVERLAY_COLOR },
  overlayBottom: { flex: 1, backgroundColor: OVERLAY_COLOR },
  finder: {
    width: FINDER_SIZE,
    height: FINDER_SIZE,
    backgroundColor: 'transparent',
  },
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: CORNER_COLOR,
    opacity: 0.8,
  },

  // Corner brackets
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0, left: 0,
    borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
  },
  cornerTR: {
    top: 0, right: 0,
    borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
  },
  cornerBL: {
    bottom: 0, left: 0,
    borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
  },
  cornerBR: {
    bottom: 0, right: 0,
    borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS,
    borderColor: CORNER_COLOR,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 56 : 32,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },

  // Hint
  hintContainer: {
    position: 'absolute',
    bottom: SCREEN_H * 0.18,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  rescanBtn: {
    marginTop: 12,
    backgroundColor: CORNER_COLOR,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  rescanText: { color: '#000', fontWeight: '700', fontSize: 14 },
});
