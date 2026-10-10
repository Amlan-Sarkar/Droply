import UIKit
import WebKit
import Photos

class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, URLSessionDownloadDelegate {

    private var webView: WKWebView!
    private var downloadSession: URLSession!
    private var activeDownloadTask: URLSessionDownloadTask?
    private var downloadStartTime: Date?
    private var currentDownloadTitle: String = "media"
    private var currentDownloadExt: String = "mp4"

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        setupDownloadSession()
        loadWebContent()
    }

    private func setupWebView() {
        let contentController = WKUserContentController()
        contentController.add(self, name: "DroplyIOS")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 10/255.0, green: 13/255.0, blue: 20/255.0, alpha: 1.0)
        webView.scrollView.backgroundColor = UIColor(red: 10/255.0, green: 13/255.0, blue: 20/255.0, alpha: 1.0)
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        view.addSubview(webView)
        webView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func setupDownloadSession() {
        let config = URLSessionConfiguration.default
        downloadSession = URLSession(configuration: config, delegate: self, delegateQueue: OperationQueue.main)
    }

    private func loadWebContent() {
        if let htmlPath = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "web") {
            let htmlUrl = URL(fileURLWithPath: htmlPath)
            let baseDir = htmlUrl.deletingLastPathComponent()
            webView.loadFileURL(htmlUrl, allowingReadAccessTo: baseDir)
        } else if let resourceUrl = Bundle.main.resourceURL {
            let webUrl = resourceUrl.appendingPathComponent("web/index.html")
            webView.loadFileURL(webUrl, allowingReadAccessTo: resourceUrl)
        }
    }

    // MARK: - WKScriptMessageHandler
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "DroplyIOS", let dict = message.body as? [String: Any] else { return }

        let action = dict["action"] as? String ?? ""

        switch action {
        case "analyze":
            if let url = dict["url"] as? String {
                handleAnalyze(url: url)
            }
        case "download":
            if let url = dict["url"] as? String {
                let formatId = dict["format_id"] as? String ?? "best"
                let isAudio = dict["is_audio"] as? Bool ?? false
                let audioFormat = dict["audio_format"] as? String ?? "mp3"
                let title = dict["title"] as? String ?? "Droply_Media"
                handleDownload(url: url, formatId: formatId, isAudio: isAudio, audioFormat: audioFormat, title: title)
            }
        case "share":
            if let path = dict["path"] as? String {
                handleShare(filePath: path)
            }
        default:
            break
        }
    }

    // MARK: - Analyze Logic
    private func handleAnalyze(url: String) {
        // Fallback fast metadata extraction for direct/social streams
        let title = "Media Item"
        let platform = detectPlatform(url: url)

        let jsonPayload: [String: Any] = [
            "id": UUID().uuidString,
            "url": url,
            "title": "\(platform) Stream",
            "platform": platform,
            "uploader": "Web Stream",
            "duration": 0,
            "duration_str": "--:--",
            "thumbnail": "",
            "formats": [
                [
                    "format_id": "best",
                    "ext": "mp4",
                    "resolution": "Best Quality",
                    "label": "Direct Stream (Auto Quality)",
                    "filesize_approx": 0,
                    "filesize_str": "Dynamic",
                    "has_video": true,
                    "has_audio": true
                ]
            ],
            "audio_formats": [
                [
                    "format_id": "mp3",
                    "ext": "mp3",
                    "resolution": "Audio",
                    "label": "High Quality Audio (MP3)",
                    "filesize_approx": 0,
                    "filesize_str": "Dynamic",
                    "has_video": false,
                    "has_audio": true,
                    "is_audio_only": true
                ]
            ]
        ]

        if let data = try? JSONSerialization.data(withJSONObject: jsonPayload),
           let jsonStr = String(data: data, encoding: .utf8) {
            let js = "window.dispatchEvent(new CustomEvent('droply_analyzed', { detail: \(jsonStr) }));"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private func detectPlatform(url: String) -> String {
        let u = url.lowercased()
        if u.contains("youtube.com") || u.contains("youtu.be") { return "YouTube" }
        if u.contains("tiktok.com") { return "TikTok" }
        if u.contains("twitter.com") || u.contains("x.com") { return "Twitter / X" }
        if u.contains("instagram.com") { return "Instagram" }
        if u.contains("reddit.com") { return "Reddit" }
        return "Web Media"
    }

    // MARK: - Download Logic
    private func handleDownload(url: String, formatId: String, isAudio: Bool, audioFormat: String, title: String) {
        guard let downloadUrl = URL(string: url) else {
            notifyError(message: "Invalid download link")
            return
        }

        currentDownloadTitle = title.replacingOccurrences(of: "/", with: "_")
        currentDownloadExt = isAudio ? audioFormat : "mp4"
        downloadStartTime = Date()

        let task = downloadSession.downloadTask(with: downloadUrl)
        activeDownloadTask = task
        task.resume()
    }

    private func notifyError(message: String) {
        let safeMsg = message.replacingOccurrences(of: "\"", with: "\\\"")
        let js = "window.dispatchEvent(new CustomEvent('droply_error', { detail: { error: \"\(safeMsg)\" } }));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - URLSessionDownloadDelegate
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        let total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : 1
        let pct = Double(totalBytesWritten) / Double(total) * 100.0

        let downloadedMB = Double(totalBytesWritten) / (1024 * 1024)
        let totalMB = Double(totalBytesExpectedToWrite) / (1024 * 1024)

        let elapsed = Date().timeIntervalSince(downloadStartTime ?? Date())
        let speed = elapsed > 0 ? (Double(totalBytesWritten) / elapsed) : 0
        let speedMB = speed / (1024 * 1024)

        let js = """
        window.dispatchEvent(new CustomEvent('droply_progress', {
            detail: {
                status: 'downloading',
                progress_percent: \(String(format: "%.1f", pct)),
                downloaded_str: '\(String(format: "%.1f MB", downloadedMB))',
                total_str: '\(totalBytesExpectedToWrite > 0 ? String(format: "%.1f MB", totalMB) : "Streaming")',
                speed_str: '\(String(format: "%.1f MB/s", speedMB))',
                eta_str: '--:--'
            }
        }));
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dest = docs.appendingPathComponent("\(currentDownloadTitle).\(currentDownloadExt)")

        try? FileManager.default.removeItem(at: dest)
        do {
            try FileManager.default.moveItem(at: location, to: dest)

            // Save to Camera Roll if video
            if currentDownloadExt == "mp4" {
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: dest)
                }, completionHandler: nil)
            }

            let js = "window.dispatchEvent(new CustomEvent('droply_completed', { detail: { status: 'completed', path: '\(dest.path)' } }));"
            webView.evaluateJavaScript(js, completionHandler: nil)

        } catch {
            notifyError(message: error.localizedDescription)
        }
    }

    private func handleShare(filePath: String) {
        let url = URL(fileURLWithPath: filePath)
        let activityVC = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        present(activityVC, animated: true, completion: nil)
    }
}
