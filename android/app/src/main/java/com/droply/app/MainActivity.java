package com.droply.app;

import android.Manifest;
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
import android.widget.Toast;

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
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
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
            executor.execute(() -> {
                File downloadDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Droply");
                if (!downloadDir.exists()) {
                    downloadDir.mkdirs();
                }

                try {
                    Python py = Python.getInstance();
                    PyObject module = py.getModule("droply_engine");

                    EngineCallback callback = new EngineCallback();
                    module.callAttr("download_media", url, formatId, isAudio, audioFormat, downloadDir.getAbsolutePath(), title, callback);
                } catch (Exception e) {
                    mainHandler.post(() -> {
                        String errJs = "window.dispatchEvent(new CustomEvent('droply_progress', { detail: { status: 'error', error: " + JSONObjectQuote(e.getMessage()) + " } }));";
                        webView.evaluateJavascript(errJs, null);
                    });
                }
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
            });
        }

        @JavascriptInterface
        public void openDownloadFolder() {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                Uri uri = Uri.parse(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).getPath() + "/Droply");
                intent.setDataAndType(uri, "*/*");
                startActivity(Intent.createChooser(intent, "Open Droply Downloads"));
            } catch (Exception e) {
                Toast.makeText(MainActivity.this, "Downloads folder: Download/Droply", Toast.LENGTH_SHORT).show();
            }
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
