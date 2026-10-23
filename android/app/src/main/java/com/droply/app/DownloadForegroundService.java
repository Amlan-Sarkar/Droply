package com.droply.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

import org.json.JSONObject;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * DownloadForegroundService manages background downloads using an ongoing Android
 * Foreground Service. This prevents downloads from being interrupted or killed by
 * OEM battery managers when the user locks their screen or switches to another app.
 */
public class DownloadForegroundService extends Service {

    private static final String TAG = "DroplyForegroundService";
    public static final String CHANNEL_ID = "droply_downloads_channel";
    public static final int NOTIFICATION_ID = 4040;

    public static final String ACTION_START_DOWNLOAD = "com.droply.app.action.START_DOWNLOAD";
    public static final String ACTION_PAUSE_DOWNLOAD = "com.droply.app.action.PAUSE_DOWNLOAD";
    public static final String ACTION_RESUME_DOWNLOAD = "com.droply.app.action.RESUME_DOWNLOAD";
    public static final String ACTION_CANCEL_DOWNLOAD = "com.droply.app.action.CANCEL_DOWNLOAD";

    public static final String EXTRA_URL = "extra_url";
    public static final String EXTRA_FORMAT_ID = "extra_format_id";
    public static final String EXTRA_IS_AUDIO = "extra_is_audio";
    public static final String EXTRA_AUDIO_FORMAT = "extra_audio_format";
    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_PLAYLIST_FOLDER = "extra_playlist_folder";

    public interface DownloadListener {
        void onProgress(String progressJson);
        void onComplete(String completeJson);
        void onError(String errorJson);
        void onPaused();
        void onCancelled();
    }

    private static volatile DownloadListener activeListener = null;

    public static void setDownloadListener(DownloadListener listener) {
        activeListener = listener;
    }

    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AtomicInteger activeDownloadCount = new AtomicInteger(0);
    private PowerManager.WakeLock wakeLock = null;
    private NotificationManager notificationManager = null;
    private long lastNotificationUpdateTime = 0;
    private String currentMediaTitle = "Media";

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();
        acquireWakeLock();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Droply Active Downloads",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows active media download progress and status in Droply");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            notificationManager.createNotificationChannel(channel);
        }
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (powerManager != null) {
                    wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Droply:DownloadWakeLock");
                    wakeLock.setReferenceCounted(false);
                    // Acquire for a safe maximum of 2 hours per download batch
                    wakeLock.acquire(2 * 60 * 60 * 1000L);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not acquire WakeLock: " + e.getMessage());
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            wakeLock = null;
        } catch (Exception ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            if (activeDownloadCount.get() <= 0) {
                stopSelf();
            }
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_PAUSE_DOWNLOAD.equals(action)) {
            handlePause();
            return START_NOT_STICKY;
        } else if (ACTION_CANCEL_DOWNLOAD.equals(action)) {
            handleCancel();
            return START_NOT_STICKY;
        } else if (ACTION_RESUME_DOWNLOAD.equals(action)) {
            handleResume(intent);
            return START_NOT_STICKY;
        }

        // Default or ACTION_START_DOWNLOAD
        String url = intent.getStringExtra(EXTRA_URL);
        String formatId = intent.getStringExtra(EXTRA_FORMAT_ID);
        boolean isAudio = intent.getBooleanExtra(EXTRA_IS_AUDIO, false);
        String audioFormat = intent.getStringExtra(EXTRA_AUDIO_FORMAT);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String playlistFolder = intent.getStringExtra(EXTRA_PLAYLIST_FOLDER);

        if (title != null && !title.trim().isEmpty()) {
            currentMediaTitle = title.trim();
        }

        // Guarantee immediate startForeground so Android doesn't kill or flag the service
        startForegroundServiceNotification(currentMediaTitle, "Starting download...", 0);

        if (url != null && !url.trim().isEmpty()) {
            activeDownloadCount.incrementAndGet();
            executeDownload(url, formatId, isAudio, audioFormat, title, playlistFolder);
        }

        return START_NOT_STICKY;
    }

    private void startForegroundServiceNotification(String title, String statusText, int progressPercent) {
        Notification notification = buildDownloadNotification(title, statusText, progressPercent, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildDownloadNotification(String title, String statusText, int progressPercent, boolean isOngoing) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Intent cancelIntent = new Intent(this, DownloadForegroundService.class);
        cancelIntent.setAction(ACTION_CANCEL_DOWNLOAD);
        PendingIntent cancelPendingIntent = PendingIntent.getService(
                this, 1, cancelIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(title != null && !title.isEmpty() ? "Downloading: " + title : "Droply — Downloading Media")
                .setContentText(statusText)
                .setContentIntent(contentPendingIntent)
                .setOngoing(isOngoing)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS);

        if (progressPercent >= 0 && progressPercent <= 100) {
            builder.setProgress(100, progressPercent, false);
        } else {
            builder.setProgress(100, 0, true);
        }

        if (isOngoing) {
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancel", cancelPendingIntent);
        }

        return builder.build();
    }

    private void updateProgressNotification(String title, String statusText, int percent) {
        long now = System.currentTimeMillis();
        // Throttle updates to at most once every 500ms to preserve battery and UI responsiveness
        if (now - lastNotificationUpdateTime > 500 || percent == 100) {
            lastNotificationUpdateTime = now;
            Notification notification = buildDownloadNotification(title, statusText, percent, true);
            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, notification);
            }
        }
    }

    private void executeDownload(String url, String formatId, boolean isAudio, String audioFormat, String title, String playlistFolder) {
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
                if (!Python.isStarted()) {
                    Python.start(new AndroidPlatform(getApplicationContext()));
                }
                Python py = Python.getInstance();
                PyObject module = py.getModule("droply_engine");

                ServiceEngineCallback callback = new ServiceEngineCallback(title != null ? title : "Media");
                module.callAttr("download_media",
                        url,
                        formatId != null ? formatId : "best",
                        isAudio,
                        audioFormat != null ? audioFormat : "mp3",
                        downloadDir.getAbsolutePath(),
                        title != null ? title : "",
                        callback,
                        playlistFolder != null ? playlistFolder : "");

            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : "";
                if (msg.contains("DownloadPausedException") || msg.contains("Download paused by user")) {
                    handlePausedCallback();
                } else if (msg.contains("Download cancelled by user")) {
                    handleCancelledCallback();
                } else {
                    handleErrorCallback(msg);
                }
            } finally {
                checkCompletionStatus();
            }
        });
    }

    private class ServiceEngineCallback {
        private final String itemTitle;

        ServiceEngineCallback(String itemTitle) {
            this.itemTitle = itemTitle;
        }

        public void onProgress(String progressJson) {
            try {
                JSONObject obj = new JSONObject(progressJson);
                double pct = obj.optDouble("percent", 0.0);
                String downloadedStr = obj.optString("downloaded_str", "");
                String totalStr = obj.optString("total_str", "");
                String speedStr = obj.optString("speed_str", "");

                String text = String.format("%.1f%% • %s / %s (%s)", pct, downloadedStr, totalStr, speedStr);
                updateProgressNotification(itemTitle, text, (int) pct);
            } catch (Exception ignored) {}

            DownloadListener listener = activeListener;
            if (listener != null) {
                mainHandler.post(() -> listener.onProgress(progressJson));
            }
        }

        public void onComplete(String completeJson) {
            String filePath = null;
            boolean isAudio = false;
            String completedTitle = itemTitle;

            try {
                JSONObject obj = new JSONObject(completeJson);
                filePath = obj.optString("file_path", null);
                isAudio = obj.optBoolean("is_audio", false);
                if (obj.has("title")) {
                    completedTitle = obj.optString("title", itemTitle);
                }
            } catch (Exception ignored) {}

            // Immediate MediaStore indexing so gallery/photos/music players pick it up right now
            if (filePath != null) {
                File targetFile = new File(filePath);
                MediaStoreHelper.indexMediaFile(DownloadForegroundService.this, targetFile, isAudio);
            }

            postCompletedNotification(completedTitle, filePath, isAudio);

            DownloadListener listener = activeListener;
            if (listener != null) {
                mainHandler.post(() -> listener.onComplete(completeJson));
            }
        }

        public void onError(String errorJson) {
            handleErrorCallback(errorJson);
        }
    }

    private void postCompletedNotification(String title, @Nullable String filePath, boolean isAudio) {
        PendingIntent openFilePendingIntent = null;
        if (filePath != null) {
            try {
                File file = new File(filePath);
                if (file.exists()) {
                    Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
                    String mimeType = MediaStoreHelper.getMimeType(file, isAudio);
                    Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                    viewIntent.setDataAndType(uri, mimeType);
                    viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

                    Intent chooser = Intent.createChooser(viewIntent, isAudio ? "Play Audio With" : "Play Video With");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                    openFilePendingIntent = PendingIntent.getActivity(
                            this, (int) System.currentTimeMillis(), chooser,
                            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                    );
                }
            } catch (Exception ignored) {}
        }

        if (openFilePendingIntent == null) {
            Intent launchIntent = new Intent(this, MainActivity.class);
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            openFilePendingIntent = PendingIntent.getActivity(
                    this, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );
        }

        NotificationCompat.Builder doneBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("Download Complete: " + title)
                .setContentText("Saved to Downloads/Droply • Tap to play")
                .setContentIntent(openFilePendingIntent)
                .setAutoCancel(true)
                .setOngoing(false)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        if (notificationManager != null) {
            notificationManager.notify((int) System.currentTimeMillis(), doneBuilder.build());
        }
    }

    private void handlePause() {
        executor.execute(() -> {
            try {
                if (Python.isStarted()) {
                    PyObject module = Python.getInstance().getModule("droply_engine");
                    module.callAttr("pause_active_download");
                }
            } catch (Exception ignored) {}
            handlePausedCallback();
        });
    }

    private void handleCancel() {
        executor.execute(() -> {
            try {
                if (Python.isStarted()) {
                    PyObject module = Python.getInstance().getModule("droply_engine");
                    module.callAttr("cancel_active_download");
                }
            } catch (Exception ignored) {}
            handleCancelledCallback();
        });
    }

    private void handleResume(Intent intent) {
        executor.execute(() -> {
            try {
                if (Python.isStarted()) {
                    PyObject module = Python.getInstance().getModule("droply_engine");
                    module.callAttr("resume_active_download");
                }
            } catch (Exception ignored) {}
            String url = intent.getStringExtra(EXTRA_URL);
            String formatId = intent.getStringExtra(EXTRA_FORMAT_ID);
            boolean isAudio = intent.getBooleanExtra(EXTRA_IS_AUDIO, false);
            String audioFormat = intent.getStringExtra(EXTRA_AUDIO_FORMAT);
            String title = intent.getStringExtra(EXTRA_TITLE);
            String playlistFolder = intent.getStringExtra(EXTRA_PLAYLIST_FOLDER);
            executeDownload(url, formatId, isAudio, audioFormat, title, playlistFolder);
        });
    }

    private void handlePausedCallback() {
        DownloadListener listener = activeListener;
        if (listener != null) {
            mainHandler.post(listener::onPaused);
        }
    }

    private void handleCancelledCallback() {
        DownloadListener listener = activeListener;
        if (listener != null) {
            mainHandler.post(listener::onCancelled);
        }
        checkCompletionStatus();
    }

    private void handleErrorCallback(String errorMsg) {
        DownloadListener listener = activeListener;
        if (listener != null) {
            mainHandler.post(() -> listener.onError("{\"error\": \"" + errorMsg.replace("\"", "\\\"") + "\"}"));
        }
        checkCompletionStatus();
    }

    private void checkCompletionStatus() {
        int remaining = activeDownloadCount.decrementAndGet();
        if (remaining <= 0) {
            activeDownloadCount.set(0);
            releaseWakeLock();
            // Stop foreground state and dismiss the ongoing progress notification
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        releaseWakeLock();
        executor.shutdown();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * Static helper to cleanly trigger a foreground download from MainActivity or anywhere in the app.
     */
    public static void startDownload(Context context, String url, String formatId, boolean isAudio, String audioFormat, String title, String playlistFolder) {
        Intent intent = new Intent(context, DownloadForegroundService.class);
        intent.setAction(ACTION_START_DOWNLOAD);
        intent.putExtra(EXTRA_URL, url);
        intent.putExtra(EXTRA_FORMAT_ID, formatId);
        intent.putExtra(EXTRA_IS_AUDIO, isAudio);
        intent.putExtra(EXTRA_AUDIO_FORMAT, audioFormat);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_PLAYLIST_FOLDER, playlistFolder);

        ContextCompat.startForegroundService(context, intent);
    }
}
