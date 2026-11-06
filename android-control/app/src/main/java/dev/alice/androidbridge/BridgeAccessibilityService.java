package dev.alice.androidbridge;

import android.accessibilityservice.AccessibilityService;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BridgeAccessibilityService extends AccessibilityService {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private volatile boolean running = false;

    private final Runnable periodic = new Runnable() {
        @Override public void run() {
            if (!running) return;
            if (BridgeConfig.armed(BridgeAccessibilityService.this)) {
                network.execute(() -> fetchCommand());
            }
            main.postDelayed(this, 15000);
        }
    };

    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        BridgeConfig.pairingCode(this);
        running = true;
        main.removeCallbacks(periodic);
        main.post(periodic);
    }

    private void fetchCommand() {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(BridgeConfig.COMMAND_URL + "?ts=" + System.currentTimeMillis());
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);
            connection.setRequestProperty("Cache-Control", "no-cache");
            if (connection.getResponseCode() != 200) return;
            if (connection.getContentLengthLong() > 4096) return;
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line);
                if (body.length() > 4096) return;
            }
            JSONObject request = new JSONObject(body.toString());
            String pairing = request.optString("pairing", "");
            String id = request.optString("id", "");
            String action = request.optString("action", "");
            if (!BridgeConfig.pairingCode(this).equals(pairing) || id.isEmpty()) return;
            if (!BridgeConfig.armed(this)) return;
            if (id.equals(BridgeConfig.prefs(this).getString("last_id", ""))) return;
            final int globalAction;
            switch (action) {
                case "BACK": globalAction = GLOBAL_ACTION_BACK; break;
                case "HOME": globalAction = GLOBAL_ACTION_HOME; break;
                case "RECENTS": globalAction = GLOBAL_ACTION_RECENTS; break;
                case "NOTIFICATIONS": globalAction = GLOBAL_ACTION_NOTIFICATIONS; break;
                case "QUICK_SETTINGS": globalAction = GLOBAL_ACTION_QUICK_SETTINGS; break;
                default: return;
            }
            BridgeConfig.prefs(this).edit().putString("last_id", id).apply();
            main.post(() -> {
                if (running && BridgeConfig.armed(this))
                    performGlobalAction(globalAction);
            });
        } catch (Exception ignored) {
            // Fail closed; intermittent network errors never trigger actions.
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        // Deliberately do not read window content or accessibility events.
    }

    @Override public void onInterrupt() { }

    @Override public void onDestroy() {
        running = false;
        main.removeCallbacks(periodic);
        network.shutdownNow();
        super.onDestroy();
    }
}
