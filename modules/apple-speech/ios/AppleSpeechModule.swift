import ExpoModulesCore
import Speech
import AVFoundation

/// VitalSync AppleSpeech Native Module
///
/// Implements the full live-transcription flow described by Apple's Speech framework:
///   SFSpeechRecognizer + AVAudioEngine + SFSpeechAudioBufferRecognitionRequest
///
/// Key hardening vs. naive implementations:
///   - removeTap before installTap prevents "tap already installed" crashes on rapid start/stop
///   - endAudio() before cancel() lets the recognizer flush the final buffer
///   - isRunning guard on audioEngine.stop() prevents throws on already-stopped engine
///   - isListening flag set to false immediately in stopSession() to prevent double-stop races
///   - All AVAudioSession operations wrapped in do/catch with non-fatal error events
///   - Cancellation error code 301 (kAFAssistantErrorDomain) is silently ignored
///   - onPermissionStatus event fires after requestPermissions() so Settings UI can react
///
public class AppleSpeechModule: Module {
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private let audioEngine = AVAudioEngine()
  private var isListening = false

  public func definition() -> ModuleDefinition {
    Name("AppleSpeechModule")

    // ── Events ────────────────────────────────────────────────────────────────
    Events("onPartialResult", "onFinalResult", "onStatus", "onError", "onPermissionStatus")

    // ── requestPermissions ────────────────────────────────────────────────────
    // Requests both speech recognition and microphone permissions sequentially.
    // Fires an onPermissionStatus event AND resolves the promise so callers
    // can react either way (event listener or await).
    AsyncFunction("requestPermissions") { (promise: Promise) in
      SFSpeechRecognizer.requestAuthorization { [weak self] speechStatus in
        guard let self = self else {
          promise.resolve(["speech": false, "microphone": false])
          return
        }

        let speechGranted = (speechStatus == .authorized)

        let micBlock: (Bool) -> Void = { micGranted in
          DispatchQueue.main.async {
            let result: [String: Bool] = ["speech": speechGranted, "microphone": micGranted]

            // Fire event so Settings UI can react without polling
            self.sendEvent("onPermissionStatus", result)

            // Surface specific denial reason
            if !speechGranted {
              self.sendEvent("onError", ["message": "Speech recognition permission not granted."])
            } else if !micGranted {
              self.sendEvent("onError", ["message": "Microphone permission not granted."])
            }

            promise.resolve(result)
          }
        }

        if #available(iOS 17, *) {
          AVAudioApplication.requestRecordPermission { granted in micBlock(granted) }
        } else {
          AVAudioSession.sharedInstance().requestRecordPermission { granted in micBlock(granted) }
        }
      }
    }

    // ── startListening ────────────────────────────────────────────────────────
    AsyncFunction("startListening") { (localeId: String, promise: Promise) in
      guard !self.isListening else {
        promise.resolve(nil)
        return
      }

      // Verify speech authorization
      guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
        self.sendEvent("onError", ["message": "Speech recognition not authorized"])
        promise.reject("NOT_AUTHORIZED", "Speech recognition not authorized")
        return
      }

      // Verify microphone permission
      let micGranted: Bool
      if #available(iOS 17, *) {
        micGranted = AVAudioApplication.shared.recordPermission == .granted
      } else {
        micGranted = AVAudioSession.sharedInstance().recordPermission == .granted
      }

      guard micGranted else {
        self.sendEvent("onError", ["message": "Microphone permission not granted"])
        promise.reject("MIC_NOT_GRANTED", "Microphone permission not granted")
        return
      }

      // Build recognizer for the requested locale (falls back to device locale)
      let locale = Locale(identifier: localeId.isEmpty ? Locale.current.identifier : localeId)
      self.speechRecognizer = SFSpeechRecognizer(locale: locale)

      guard let recognizer = self.speechRecognizer, recognizer.isAvailable else {
        self.sendEvent("onError", ["message": "Speech recognizer not available for locale: \(localeId)"])
        promise.reject("NOT_AVAILABLE", "Speech recognizer not available")
        return
      }

      do {
        try self.startSession()
        self.isListening = true
        self.sendEvent("onStatus", ["status": "listening"])
        promise.resolve(nil)
      } catch {
        self.sendEvent("onError", ["message": error.localizedDescription])
        promise.reject("START_FAILED", error.localizedDescription)
      }
    }

    // ── stopListening ─────────────────────────────────────────────────────────
    AsyncFunction("stopListening") { (promise: Promise) in
      self.stopSession()
      promise.resolve(nil)
    }
  }

  // ── startSession ─────────────────────────────────────────────────────────────
  private func startSession() throws {
    // Cancel any existing task before starting a new one
    recognitionTask?.cancel()
    recognitionTask = nil

    // Configure AVAudioSession for recording
    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
    try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

    // Build the recognition request with partial results enabled
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if #available(iOS 13, *) {
      // Allow server-side recognition for better accuracy; falls back to on-device
      request.requiresOnDeviceRecognition = false
    }
    recognitionRequest = request

    // Install audio tap — always remove first to prevent "tap already installed" crash
    // on rapid start/stop cycles (e.g., user taps mic twice quickly)
    let inputNode = audioEngine.inputNode
    inputNode.removeTap(onBus: 0)
    let recordingFormat = inputNode.outputFormat(forBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
      self?.recognitionRequest?.append(buffer)
    }

    audioEngine.prepare()
    try audioEngine.start()

    // Start the recognition task and stream results back as events
    recognitionTask = speechRecognizer?.recognitionTask(with: request) { [weak self] result, error in
      guard let self = self else { return }

      if let result = result {
        let transcript = result.bestTranscription.formattedString
        DispatchQueue.main.async {
          if result.isFinal {
            self.sendEvent("onFinalResult", ["transcript": transcript])
            self.stopSession()
          } else {
            self.sendEvent("onPartialResult", ["transcript": transcript])
          }
        }
      }

      if let error = error {
        let nsError = error as NSError
        // Code 301 = kAFAssistantErrorDomain cancelled — not a real error
        if nsError.code != 301 {
          DispatchQueue.main.async {
            self.sendEvent("onError", ["message": error.localizedDescription])
            self.stopSession()
          }
        }
      }
    }
  }

  // ── stopSession ───────────────────────────────────────────────────────────────
  private func stopSession() {
    // Mark as not listening immediately to prevent re-entrant calls
    isListening = false

    // Stop the audio engine only if it is currently running
    if audioEngine.isRunning {
      audioEngine.stop()
    }

    // Always remove the tap — safe to call even if no tap is installed
    audioEngine.inputNode.removeTap(onBus: 0)

    // End audio first so the recognizer can process the final buffer,
    // then cancel the task (matches Apple's recommended teardown order)
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()

    recognitionRequest = nil
    recognitionTask = nil

    // Deactivate audio session — non-fatal if it fails
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    } catch {
      // Non-fatal: audio session deactivation failure — log as event for debugging
      sendEvent("onError", ["message": "Audio session deactivation: \(error.localizedDescription)"])
    }

    sendEvent("onStatus", ["status": "done"])
  }
}
