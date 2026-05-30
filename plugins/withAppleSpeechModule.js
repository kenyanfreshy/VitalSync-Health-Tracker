/**
 * withAppleSpeechModule.js
 *
 * Expo Config Plugin that:
 *  A) Writes AppleSpeechModule.swift into ios/<AppName>/
 *  B) Registers it in the .pbxproj Compile Sources build phase
 *
 * FIX (Apr 2026): Replaced the two-step withDangerousMod + withXcodeProject
 * approach with a single withDangerousMod that both writes the Swift file AND
 * edits the pbxproj in the same pass. This guarantees the file exists on disk
 * before the pbxproj reference is written, preventing the EAS build error:
 *   "Build input file cannot be found: '.../AppleSpeechModule.swift'"
 *
 * The Swift module uses SFSpeechRecognizer + AVAudioEngine to provide
 * live speech-to-text. It emits React Native events:
 *   - AppleSpeech.onPartialResult  { text: string }
 *   - AppleSpeech.onFinalResult    { text: string }
 *   - AppleSpeech.onStatus         { status: 'idle'|'listening'|'processing' }
 *   - AppleSpeech.onError          { message: string }
 *
 * Exposed JS methods (via NativeModules.AppleSpeechModule):
 *   - requestPermissions() → Promise<{ microphone: boolean, speech: boolean }>
 *   - startListening(localeId: string) → Promise<void>
 *   - stopListening() → Promise<string>   // returns final transcript
 *   - cancelListening() → Promise<void>
 *   - isAvailable() → Promise<boolean>
 */
const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const SWIFT_FILENAME = "AppleSpeechModule.swift";

const SWIFT_SOURCE = `
import Foundation
import Speech
import AVFoundation

// MARK: - AppleSpeechModule
// Live speech-to-text using SFSpeechRecognizer + AVAudioEngine.
// Emits React Native events for partial/final results, status, and errors.
// Safe for iOS 17+ New Architecture (no TurboModule bridge involvement).

@objc(AppleSpeechModule)
class AppleSpeechModule: RCTEventEmitter {

  // ── State ──────────────────────────────────────────────────────────────────
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private let audioEngine = AVAudioEngine()
  private var finalTranscript = ""
  private var isListening = false

  // ── RCTEventEmitter ────────────────────────────────────────────────────────
  override func supportedEvents() -> [String]! {
    return [
      "AppleSpeech.onPartialResult",
      "AppleSpeech.onFinalResult",
      "AppleSpeech.onStatus",
      "AppleSpeech.onError",
    ]
  }

  override static func requiresMainQueueSetup() -> Bool { return false }

  // ── requestPermissions ─────────────────────────────────────────────────────
  @objc func requestPermissions(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    var micGranted = false
    var speechGranted = false
    let group = DispatchGroup()

    // Microphone — use the iOS 17+ API when available to silence -Wdeprecated-declarations
    group.enter()
    if #available(iOS 17, *) {
      AVAudioApplication.shared.requestRecordPermission { granted in
        micGranted = granted
        group.leave()
      }
    } else {
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        micGranted = granted
        group.leave()
      }
    }

    // Speech recognition
    group.enter()
    SFSpeechRecognizer.requestAuthorization { status in
      speechGranted = (status == .authorized)
      group.leave()
    }

    group.notify(queue: .main) {
      resolve(["microphone": micGranted, "speech": speechGranted])
    }
  }

  // ── isAvailable ────────────────────────────────────────────────────────────
  @objc func isAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let available = SFSpeechRecognizer.authorizationStatus() == .authorized
    resolve(available)
  }

  // ── startListening ─────────────────────────────────────────────────────────
  @objc func startListening(
    _ localeId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      // Stop any existing session first
      self.stopSession()

      // Check permissions — AVAudioApplication.shared is iOS 17+; fall back to AVAudioSession on older OS
      let micPermissionGranted: Bool
      if #available(iOS 17, *) {
        micPermissionGranted = AVAudioApplication.shared.recordPermission == .granted
      } else {
        micPermissionGranted = AVAudioSession.sharedInstance().recordPermission == .granted
      }
      guard micPermissionGranted else {
        reject("PERMISSION_DENIED", "Microphone permission not granted", nil)
        return
      }
      guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
        reject("PERMISSION_DENIED", "Speech recognition permission not granted", nil)
        return
      }

      // Create recognizer for locale
      let locale = Locale(identifier: localeId.isEmpty ? "en-US" : localeId)
      guard let recognizer = SFSpeechRecognizer(locale: locale),
            recognizer.isAvailable else {
        reject("NOT_AVAILABLE", "Speech recognizer not available for locale: \\(localeId)", nil)
        return
      }
      self.speechRecognizer = recognizer
      self.finalTranscript = ""

      // Configure audio session
      let audioSession = AVAudioSession.sharedInstance()
      do {
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
      } catch {
        reject("AUDIO_SESSION", "Failed to configure audio session: \\(error.localizedDescription)", error)
        return
      }

      // Create recognition request
      let request = SFSpeechAudioBufferRecognitionRequest()
      request.shouldReportPartialResults = true
      request.requiresOnDeviceRecognition = false
      self.recognitionRequest = request

      // Start recognition task
      self.recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
        guard let self = self else { return }

        if let result = result {
          let transcript = result.bestTranscription.formattedString
          if result.isFinal {
            self.finalTranscript = transcript
            self.sendEvent(withName: "AppleSpeech.onFinalResult", body: ["text": transcript])
          } else {
            self.sendEvent(withName: "AppleSpeech.onPartialResult", body: ["text": transcript])
          }
        }

        if let error = error {
          // Code 1110 = "No speech detected" — not a real error
          let nsError = error as NSError
          if nsError.code != 1110 {
            self.sendEvent(withName: "AppleSpeech.onError", body: ["message": error.localizedDescription])
          }
          self.stopSession()
          self.sendEvent(withName: "AppleSpeech.onStatus", body: ["status": "idle"])
        }
      }

      // Install audio tap
      let inputNode = self.audioEngine.inputNode
      let recordingFormat = inputNode.outputFormat(forBus: 0)
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
        self?.recognitionRequest?.append(buffer)
      }

      // Start audio engine
      do {
        self.audioEngine.prepare()
        try self.audioEngine.start()
        self.isListening = true
        self.sendEvent(withName: "AppleSpeech.onStatus", body: ["status": "listening"])
        resolve(nil)
      } catch {
        self.stopSession()
        reject("AUDIO_ENGINE", "Failed to start audio engine: \\(error.localizedDescription)", error)
      }
    }
  }

  // ── stopListening ──────────────────────────────────────────────────────────
  @objc func stopListening(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { resolve(""); return }
      self.sendEvent(withName: "AppleSpeech.onStatus", body: ["status": "processing"])
      // Signal end of audio — recognition task will deliver final result
      self.recognitionRequest?.endAudio()
      // Give the recognizer 1.5 s to deliver the final result
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
        guard let self = self else { resolve(""); return }
        let transcript = self.finalTranscript
        self.stopSession()
        self.sendEvent(withName: "AppleSpeech.onStatus", body: ["status": "idle"])
        resolve(transcript)
      }
    }
  }

  // ── cancelListening ────────────────────────────────────────────────────────
  @objc func cancelListening(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      self?.stopSession()
      self?.sendEvent(withName: "AppleSpeech.onStatus", body: ["status": "idle"])
      resolve(nil)
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────
  private func stopSession() {
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
    recognitionRequest?.endAudio()
    recognitionRequest = nil
    recognitionTask?.cancel()
    recognitionTask = nil
    isListening = false
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
`;

/**
 * Generate a deterministic 24-char uppercase hex UUID from a string seed.
 * Stable across rebuilds — same seed always produces the same UUID.
 * Exported at module level so tests can import and verify the algorithm.
 */
function makeUUID(seed) {
  // FNV-1a 32-bit hash, expanded to 24 hex chars
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const part = (s) => {
    let v = h ^ s;
    v = (v * 0x01000193) >>> 0;
    return v.toString(16).toUpperCase().padStart(8, "0");
  };
  return part(1) + part(2) + part(3);
}

/**
 * Single-pass modifier: write the Swift file to disk AND register it in the
 * pbxproj Compile Sources phase within the same withDangerousMod callback.
 *
 * Using a single pass is critical: withDangerousMod runs AFTER withXcodeProject
 * in the Expo Config Plugin pipeline, so if we used withXcodeProject for the
 * pbxproj edit the file reference would be added before the file exists on disk.
 */
module.exports = function withAppleSpeechModule(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appName = config.modRequest.projectName;
      const iosDir = path.join(projectRoot, "ios", appName);
      const iosProjectDir = path.join(projectRoot, "ios");

      // ── 1. Write Swift source file ─────────────────────────────────────────
      if (!fs.existsSync(iosDir)) {
        fs.mkdirSync(iosDir, { recursive: true });
      }
      const swiftPath = path.join(iosDir, SWIFT_FILENAME);
      fs.writeFileSync(swiftPath, SWIFT_SOURCE.trimStart(), "utf8");
      console.log(`[withAppleSpeechModule] Wrote ${SWIFT_FILENAME} → ${swiftPath}`);

      // ── 2. Edit pbxproj to add the file to Compile Sources ─────────────────
      // Find the .xcodeproj
      const xcodeprojDir = fs
        .readdirSync(iosProjectDir)
        .find((f) => f.endsWith(".xcodeproj"));

      if (!xcodeprojDir) {
        console.warn("[withAppleSpeechModule] No .xcodeproj found — skipping pbxproj edit");
        return config;
      }

      const pbxprojPath = path.join(iosProjectDir, xcodeprojDir, "project.pbxproj");
      if (!fs.existsSync(pbxprojPath)) {
        console.warn(`[withAppleSpeechModule] project.pbxproj not found at ${pbxprojPath}`);
        return config;
      }

      let pbxproj = fs.readFileSync(pbxprojPath, "utf8");

      // Idempotency check — skip if already registered
      if (pbxproj.includes(SWIFT_FILENAME)) {
        console.log(`[withAppleSpeechModule] ${SWIFT_FILENAME} already in pbxproj — skipping`);
        return config;
      }

      // Deterministic UUIDs derived from filename — stable across rebuilds
      const fileRefUUID = makeUUID("fileRef:" + SWIFT_FILENAME);
      const buildFileUUID = makeUUID("buildFile:" + SWIFT_FILENAME);

      // Use SOURCE_ROOT-relative path so Xcode resolves correctly regardless of
      // which PBXGroup the entry lands in. The file lives at ios/<AppName>/AppleSpeechModule.swift
      // and SOURCE_ROOT points to ios/, so the path is <AppName>/AppleSpeechModule.swift.
      const fileRefPath = `${appName}/${SWIFT_FILENAME}`;
      const fileRefEntry = `\t\t${fileRefUUID} /* ${SWIFT_FILENAME} */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; name = ${SWIFT_FILENAME}; path = ${fileRefPath}; sourceTree = SOURCE_ROOT; };\n`;
      const buildFileEntry = `\t\t${buildFileUUID} /* ${SWIFT_FILENAME} in Sources */ = {isa = PBXBuildFile; fileRef = ${fileRefUUID} /* ${SWIFT_FILENAME} */; };\n`;
      const sourcesEntry = `\t\t\t\t${buildFileUUID} /* ${SWIFT_FILENAME} in Sources */,\n`;

      // Insert PBXFileReference
      pbxproj = pbxproj.replace(
        /(\/\* Begin PBXFileReference section \*\/\n)/,
        `$1${fileRefEntry}`
      );

      // Insert PBXBuildFile
      pbxproj = pbxproj.replace(
        /(\/\* Begin PBXBuildFile section \*\/\n)/,
        `$1${buildFileEntry}`
      );

      // Insert into PBXSourcesBuildPhase files list
      // Find the Sources build phase and insert before its closing );
      pbxproj = pbxproj.replace(
        /(\/\* Sources \*\/ = \{[^}]*?files = \([^)]*?)(\s*\);)/s,
        `$1\n${sourcesEntry}$2`
      );

      // Add to PBXGroup for <AppName> (so it appears in the Xcode file tree)
      // Find the group named <AppName> and insert before its closing );
      const groupPattern = new RegExp(
        `(\\/\\* ${appName} \\*\\/ = \\{[\\s\\S]*?children = \\([\\s\\S]*?)(\\s*\\);)`,
        "m"
      );
      pbxproj = pbxproj.replace(
        groupPattern,
        `$1\n\t\t\t\t${fileRefUUID} /* ${SWIFT_FILENAME} */,\n$2`
      );

      fs.writeFileSync(pbxprojPath, pbxproj, "utf8");
      console.log(`[withAppleSpeechModule] Registered ${SWIFT_FILENAME} in pbxproj (fileRef: ${fileRefUUID}, buildFile: ${buildFileUUID})`);

      return config;
    },
  ]);
};
