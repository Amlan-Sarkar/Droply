package com.droply.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.MimeTypeMap;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private final ExecutorService executor = Executors.newFixedThreadPool(8);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private String pendingSharedUrl = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Request runtime permissions if required
        requestAppPermissions();

        // Initialize embedded Python runtime
        initPython();

        // Setup WebView
        setupWebView();

        // Handle incoming share intents (e.g. from YouTube, Twitter, Instagram apps)
        handleIncomingIntent(getIntent());
    }

    private void initPython() {
        if (!Python.isStarted()) {
            Python.start(new AndroidPlatform(this));
        }
        setupFfmpeg();
    }

    private void setupFfmpeg() {
        executor.execute(() -> {
            try {
                File nativeLib = new File(getApplicationInfo().nativeLibraryDir, "libffmpeg.so");
                String ffmpegPath = null;
                if (nativeLib.exists()) {
                    ffmpegPath = nativeLib.getAbsolutePath();
                } else {
                    File internalFfmpeg = new File(getFilesDir(), "ffmpeg");
                    if (internalFfmpeg.exists()) {
                        internalFfmpeg.setExecutable(true, false);
                        ffmpegPath = internalFfmpeg.getAbsolutePath();
                    } else {
                        try (java.io.InputStream in = getAssets().open("bin/ffmpeg");
                             java.io.FileOutputStream out = new java.io.FileOutputStream(internalFfmpeg)) {
                            byte[] buf = new byte[8192];
                            int len;
                            while ((len = in.read(buf)) > 0) {
                                out.write(buf, 0, len);
                            }
                            internalFfmpeg.setExecutable(true, false);
                            ffmpegPath = internalFfmpeg.getAbsolutePath();
                        } catch (Exception ignored) {}
                    }
                }

                if (ffmpegPath != null && Python.isStarted()) {
                    PyObject pyEngine = Python.getInstance().getModule("droply_engine");
                    if (pyEngine != null) {
                        pyEngine.callAttr("set_ffmpeg_path", ffmpegPath);
                    }
                }
            } catch (Exception ignored) {}
        });
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            String[] permissions = {
                    Manifest.permission.POST_NOTIFICATIONS,
                    Manifest.permission.READ_MEDIA_VIDEO,
                    Manifest.permission.READ_MEDIA_AUDIO
            };
            ActivityCompat.requestPermissions(this, permissions, 101);
        } else if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE, Manifest.permission.READ_EXTERNAL_STORAGE},
                        102);
            }
        }
    }

    private void setupWebView() {
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Add native Droply Android bridge to JavaScript
        webView.addJavascriptInterface(new DroplyNativeBridge(), "DroplyAndroid");

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/static/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    view.loadUrl("file:///android_asset/web/index.html");
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (pendingSharedUrl != null) {
                    injectSharedUrl(pendingSharedUrl);
                    pendingSharedUrl = null;
                }
            }
        });

        // Load local Droply web app via secure asset loader
        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                pendingSharedUrl = sharedText.trim();
                if (webView != null) {
                    injectSharedUrl(pendingSharedUrl);
                    pendingSharedUrl = null;
                }
            }
        }
    }

    private void injectSharedUrl(String url) {
        String script = "javascript:(function(){" +
                "  var input = document.getElementById('single-url-input');" +
                "  if(input){" +
                "    input.value = " + JSONObjectQuote(url) + ";" +
                "    input.dispatchEvent(new Event('input', { bubbles: true }));" +
                "    var btn = document.getElementById('btn-analyze');" +
                "    if(btn) btn.click();" +
                "  }" +
                "})();";
        mainHandler.post(() -> webView.evaluateJavascript(script, null));
    }

    private String JSONObjectQuote(String string) {
        return "\"" + string.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "") + "\"";
    }

    /**
     * Native JavaScript Bridge exposed as `window.DroplyAndroid`
     */
    public class DroplyNativeBridge {

        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }

        @JavascriptInterface
        public void analyzeUrl(String url) {
            executor.execute(() -> {
                try {
                    Python py = Python.getInstance();
                    PyObject module = py.getModule("droply_engine");
                    PyObject result = module.callAttr("analyze_url", url);
                    String json = result.toString();

                    mainHandler.post(() -> {
                        String js = "window.dispatchEvent(new CustomEvent('droply_analyzed', { detail: " + json + " }));";
                        webView.evaluateJavascript(js, null);
                    });
                } catch (Exception e) {
                    mainHandler.post(() -> {
                        String errJson = "{\"error\": " + JSONObjectQuote(e.getMessage()) + "}";
                        String js = "window.dispatchEvent(new CustomEvent('droply_analyzed', { detail: " + errJson + " }));";
                        webView.evaluateJavascript(js, null);
                    });
                }
            });
        }

        @JavascriptInterface
        public void startDownload(String url, String formatId, boolean isAudio, String audioFormat, String title) {
            startDownloadWithFolder(url, formatId, isAudio, audioFormat, title, "");
        }

        @JavascriptInterface
        public void startDownloadWithFolder(String url, String formatId, boolean isAudio, String audioFormat, String title, String playlistFolder) {
            executor.execute(() -> {
                File downloadDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Droply");
                if (playlistFolder != null && !playlistFolder.trim().isEmpty()) {
                    String cleanFolder = playlistFolder.replaceAll("[\\\\/*?:\"<>|]", "").trim();
                    downloadDir = new File(downloadDir, cleanFolder);
                }
                if (!downloadDir.exists()) {
                    downloadDir.mkdirs();
                }

                try {
                    Python py = Python.getInstance();
                    PyObject module = py.getModule("droply_engine");

                    EngineCallback callback = new EngineCallback();
                    module.callAttr("download_media", url, formatId, isAudio, audioFormat, downloadDir.getAbsolutePath(), title, callback, playlistFolder != null ? playlistFolder : "");
                } catch (Exception e) {
                    if (e.getMessage() != null && (e.getMessage().contains("DownloadPausedException") || e.getMessage().contains("Download paused by user"))) {
                        mainHandler.post(() -> {
                            String js = "window.dispatchEvent(new CustomEvent('droply_paused', { detail: {} }));";
                            webView.evaluateJavascript(js, null);
                        });
                        return;
                    }
                    mainHandler.post(() -> {
                        String errJs = "window.dispatchEvent(new CustomEvent('droply_error', { detail: { error: " + JSONObjectQuote(e.getMessage()) + " } }));";
                        webView.evaluateJavascript(errJs, null);
                    });
                }
            });
        }

        @JavascriptInterface
        public void pauseDownload() {
            executor.execute(() -> {
                try {
                    Python py = Python.getInstance();
                    PyObject module = py.getModule("droply_engine");
                    module.callAttr("pause_active_download");
                } catch (Exception ignored) {}
                mainHandler.post(() -> {
                    String js = "window.dispatchEvent(new CustomEvent('droply_paused', { detail: {} }));";
                    webView.evaluateJavascript(js, null);
                });
            });
        }

        @JavascriptInterface
        public void resumeDownload(String url, String formatId, boolean isAudio, String audioFormat, String title, String playlistFolder) {
            executor.execute(() -> {
                try {
                    Python py = Python.getInstance();
                    PyObject module = py.getModule("droply_engine");
                    module.callAttr("resume_active_download");
                } catch (Exception ignored) {}
                startDownloadWithFolder(url, formatId, isAudio, audioFormat, title, playlistFolder);
            });
        }

        @JavascriptInterface
        public String getClipboardText() {
            final String[] result = {""};
            final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
            mainHandler.post(() -> {
                try {
                    android.content.ClipboardManager clipboard = (android.content.ClipboardManager) getSystemService(android.content.Context.CLIPBOARD_SERVICE);
                    if (clipboard != null && clipboard.hasPrimaryClip() && clipboard.getPrimaryClip().getItemCount() > 0) {
                        CharSequence text = clipboard.getPrimaryClip().getItemAt(0).getText();
                        if (text != null) {
                            result[0] = text.toString();
                        }
                    }
                } catch (Exception ignored) {
                } finally {
                    latch.countDown();
                }
            });
            try {
                latch.await(600, java.util.concurrent.TimeUnit.MILLISECONDS);
            } catch (InterruptedException ignored) {}
            return result[0];
        }

        @JavascriptInterface
        public void cancelDownload() {
            executor.execute(() -> {
                try {
                    Python py = Python.getInstance();
                    PyObject module = py.getModule("droply_engine");
                    module.callAttr("cancel_active_download");
                } catch (Exception ignored) {}
                mainHandler.post(() -> {
                    String js = "window.dispatchEvent(new CustomEvent('droply_cancelled', { detail: {} }));";
                    webView.evaluateJavascript(js, null);
                });
            });
        }

        @JavascriptInterface
        public void saveSetting(String key, String value) {
            try {
                getSharedPreferences("droply_prefs", MODE_PRIVATE).edit().putString(key, value).apply();
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public String getSetting(String key, String defaultValue) {
            try {
                return getSharedPreferences("droply_prefs", MODE_PRIVATE).getString(key, defaultValue);
            } catch (Exception e) {
                return defaultValue;
            }
        }

        @JavascriptInterface
        public void openFile(String filePath) {
            mainHandler.post(() -> {
                try {
                    File file = null;
                    if (filePath != null && !filePath.trim().isEmpty()) {
                        file = new File(filePath);
                    }
                    File downloadDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Droply");
                    if (file == null || !file.exists()) {
                        if (file != null) {
                            File candidate = new File(downloadDir, file.getName());
                            if (candidate.exists()) {
                                file = candidate;
                            }
                        }
                    }
                    if (file == null || !file.exists() || file.isDirectory()) {
                        // Find the most recent media file in Droply download folder
                        if (downloadDir.exists()) {
                            File[] candidates = downloadDir.listFiles(f -> f.isFile() && !f.getName().startsWith("."));
                            if (candidates != null && candidates.length > 0) {
                                java.util.Arrays.sort(candidates, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
                                file = candidates[0];
                            }
                        }
                    }

                    if (file == null || !file.exists() || file.isDirectory()) {
                        Toast.makeText(MainActivity.this, "No downloaded media found in Download/Droply", Toast.LENGTH_SHORT).show();
                        return;
                    }

                    String name = file.getName();
                    String extension = "";
                    int dot = name.lastIndexOf('.');
                    if (dot >= 0) {
                        extension = name.substring(dot + 1).toLowerCase();
                    }

                    String mimeType;
                    if (extension.matches("mp3|m4a|wav|aac|flac|ogg|opus|wma")) {
                        mimeType = "audio/*";
                    } else {
                        mimeType = "video/*";
                    }

                    Uri fileUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", file);
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(fileUri, mimeType);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                    Intent chooser = Intent.createChooser(intent, mimeType.startsWith("audio") ? "Play Audio With" : "Play Video With");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(chooser);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Could not open media: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void checkUpdates() {
            executor.execute(() -> {
                try {
                    String versionName = "v1.4.3";
                    try {
                        versionName = "v" + getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                    } catch (Exception ignored) {}

                    Python py = Python.getInstance();
                    PyObject module = py.getModule("droply_engine");
                    PyObject result = module.callAttr("check_updates", versionName);
                    String json = result.toString();
                    mainHandler.post(() -> {
                        String js = "window.dispatchEvent(new CustomEvent('droply_update_checked', { detail: " + json + " }));";
                        webView.evaluateJavascript(js, null);
                    });
                } catch (Exception e) {
                    mainHandler.post(() -> {
                        String errJson = "{\"error\": " + JSONObjectQuote(e.getMessage()) + "}";
                        String js = "window.dispatchEvent(new CustomEvent('droply_update_checked', { detail: " + errJson + " }));";
                        webView.evaluateJavascript(js, null);
                    });
                }
            });
        }

        @JavascriptInterface
        public void updateYtdlpCore() {
            executor.execute(() -> {
                try {
                    Python py = Python.getInstance();
                    PyObject module = py.getModule("droply_engine");
                    PyObject result = module.callAttr("update_ytdlp_core");
                    String json = result.toString();
                    mainHandler.post(() -> {
                        String js = "window.dispatchEvent(new CustomEvent('droply_ytdlp_updated', { detail: " + json + " }));";
                        webView.evaluateJavascript(js, null);
                    });
                } catch (Exception e) {
                    mainHandler.post(() -> {
                        String errJson = "{\"error\": " + JSONObjectQuote(e.getMessage()) + "}";
                        String js = "window.dispatchEvent(new CustomEvent('droply_ytdlp_updated', { detail: " + errJson + " }));";
                        webView.evaluateJavascript(js, null);
                    });
                }
            });
        }

        @JavascriptInterface
        public void openDownloadFolder() {
            mainHandler.post(() -> {
                File droplyDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Droply");
                if (!droplyDir.exists()) {
                    droplyDir.mkdirs();
                }

                // 1. Try modern Android DocumentsUI to open Download/Droply directory directly
                try {
                    Uri folderUri = Uri.parse("content://com.android.externalstorage.documents/document/primary%3ADownload%2FDroply");
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(folderUri, "vnd.android.document/directory");
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(intent);
                    return;
                } catch (Exception ignored) {}

                // 2. Try DownloadManager native downloads UI
                try {
                    Intent intent = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    return;
                } catch (Exception ignored) {}

                // 3. Try FileProvider directory view
                try {
                    Uri dirUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", droplyDir);
                    Intent fpIntent = new Intent(Intent.ACTION_VIEW);
                    fpIntent.setDataAndType(dirUri, "resource/folder");
                    fpIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(fpIntent);
                    return;
                } catch (Exception ignored) {}

                // 4. Safe informative fallback
                Toast.makeText(MainActivity.this, "Downloads folder: Download/Droply", Toast.LENGTH_LONG).show();
            });
        }
    }

    public class EngineCallback {
        public void onProgress(String progressJson) {
            mainHandler.post(() -> {
                String js = "window.dispatchEvent(new CustomEvent('droply_progress', { detail: " + progressJson + " }));";
                webView.evaluateJavascript(js, null);
            });
        }

        public void onComplete(String completeJson) {
            mainHandler.post(() -> {
                String js = "window.dispatchEvent(new CustomEvent('droply_completed', { detail: " + completeJson + " }));";
                webView.evaluateJavascript(js, null);
                Toast.makeText(MainActivity.this, "Download completed!", Toast.LENGTH_SHORT).show();
            });
        }

        public void onError(String errorJson) {
            mainHandler.post(() -> {
                String js = "window.dispatchEvent(new CustomEvent('droply_error', { detail: " + errorJson + " }));";
                webView.evaluateJavascript(js, null);
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
