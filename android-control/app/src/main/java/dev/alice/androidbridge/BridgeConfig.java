package dev.alice.androidbridge;

import android.content.Context;
import android.content.SharedPreferences;
import java.security.SecureRandom;
import java.util.Locale;

final class BridgeConfig {
    private static final String PREFERENCES = "bridge_config";
    // Public repository: commands MUST NOT include private data.
    static final String COMMAND_URL =
        "https://raw.githubusercontent.com/Zweeback/alicealpha/alice-android-bridge/android-control/remote/command.json";

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    static synchronized String pairingCode(Context context) {
        SharedPreferences preferences = prefs(context);
        String code = preferences.getString("pairing", "");
        if (code.isEmpty()) {
            byte[] bytes = new byte[12];
            new SecureRandom().nextBytes(bytes);
            StringBuilder builder = new StringBuilder();
            for (byte b : bytes) builder.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            code = builder.toString();
            preferences.edit().putString("pairing", code).apply();
        }
        return code;
    }

    static boolean armed(Context context) {
        return prefs(context).getBoolean("armed", false);
    }

    static void setArmed(Context context, boolean armed) {
        prefs(context).edit().putBoolean("armed", armed).apply();
    }
}
