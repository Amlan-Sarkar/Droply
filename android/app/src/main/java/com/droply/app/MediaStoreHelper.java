package com.droply.app;

import android.content.Context;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.util.Log;
import android.webkit.MimeTypeMap;

import java.io.File;

/**
 * MediaStoreHelper ensures that downloaded video and audio files are immediately
 * indexed by Android's MediaStore so they show up instantly in Google Photos,
 * Samsung Gallery, system file pickers, and music players.
 */
public class MediaStoreHelper {

    private static final String TAG = "DroplyMediaStore";

    /**
     * Resolves appropriate MIME type based on file extension and media type.
     */
    public static String getMimeType(File file, boolean isAudio) {
        if (file == null) {
            return isAudio ? "audio/mpeg" : "video/mp4";
        }
        String name = file.getName();
        int dot = name.lastIndexOf('.');
        String ext = (dot >= 0) ? name.substring(dot + 1).toLowerCase() : "";

        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        if (mime != null && !mime.isEmpty()) {
            return mime;
        }

        switch (ext) {
            case "mp3": return "audio/mpeg";
            case "m4a": case "aac": return "audio/mp4";
            case "wav": return "audio/x-wav";
            case "flac": return "audio/flac";
            case "ogg": case "opus": return "audio/ogg";
            case "mp4": return "video/mp4";
            case "mkv": return "video/x-matroska";
            case "webm": return "video/webm";
            case "mov": return "video/quicktime";
            case "avi": return "video/x-msvideo";
            default: return isAudio ? "audio/*" : "video/*";
        }
    }

    /**
     * Triggers asynchronous MediaScanner indexing for the downloaded file.
     * Compatible with Android 7.0 through Android 15+.
     */
    public static void indexMediaFile(Context context, File file, boolean isAudio) {
        if (context == null || file == null || !file.exists()) {
            Log.w(TAG, "Cannot index null or non-existent file: " + file);
            return;
        }

        final String mimeType = getMimeType(file, isAudio);
        final String absolutePath = file.getAbsolutePath();

        try {
            MediaScannerConnection.scanFile(
                    context.getApplicationContext(),
                    new String[]{absolutePath},
                    new String[]{mimeType},
                    (path, uri) -> {
                        if (uri != null) {
                            Log.i(TAG, "Successfully indexed in MediaStore: " + path + " -> " + uri);
                        } else {
                            Log.w(TAG, "MediaStore scan returned null URI for: " + path);
                        }
                    }
            );
        } catch (Exception e) {
            Log.e(TAG, "MediaScannerConnection error for " + absolutePath, e);
        }

        // Secondary legacy broadcast fallback for broader OEM compatibility (MIUI / ColorOS / EMUI)
        try {
            Intent scanIntent = new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE);
            scanIntent.setData(Uri.fromFile(file));
            context.sendBroadcast(scanIntent);
        } catch (Exception ignored) {}
    }
}
