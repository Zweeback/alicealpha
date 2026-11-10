package dev.alice.androidbridge;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.provider.Settings;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int dp = (int) (20 * getResources().getDisplayMetrics().density);
        root.setPadding(dp, dp, dp, dp);
        root.setBackgroundColor(0xFF111827);
        TextView heading = label("ALICE · Gerätebrücke", 25, 0xFFFFFFFF);
        heading.setTypeface(null, Typeface.BOLD);
        root.addView(heading);
        root.addView(label(
            "Erster Test: Zurück, Startbildschirm, Übersicht, Benachrichtigungen. " +
            "Kein Lesen des Bildschirms, keine Nachrichten, keine Passwörter.",
            16, 0xFFE5E7EB));
        root.addView(label("Einmaliger Kopplungscode:", 16, 0xFF93C5FD));
        final String code = BridgeConfig.pairingCode(this);
        TextView token = label(code, 18, 0xFFFFFFFF);
        token.setTextIsSelectable(true);
        root.addView(token);
        Button copy = button("Code kopieren");
        copy.setOnClickListener(v -> {
            ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE))
                .setPrimaryClip(ClipData.newPlainText("ALICE Pairing", code));
            Toast.makeText(this, "Kopiert – im Chat senden", Toast.LENGTH_SHORT).show();
        });
        root.addView(copy);
        Button settings = button("1 · Android-Bedienungshilfe öffnen");
        settings.setOnClickListener(v ->
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        root.addView(settings);
        Button on = button("2 · Fernnavigation einschalten");
        on.setOnClickListener(v -> {
            BridgeConfig.setArmed(this, true);
            refresh();
        });
        root.addView(on);
        Button off = button("STOPP – sofort deaktivieren");
        off.setOnClickListener(v -> {
            BridgeConfig.setArmed(this, false);
            refresh();
        });
        root.addView(off);
        status = label("", 16, 0xFF86EFAC);
        root.addView(status);
        root.addView(label(
            "Die Befehle liegen in einem öffentlichen GitHub-Zweig; " +
            "keine privaten Daten dorthin schreiben. Android behält " +
            "die Kontrolle über Berechtigungen. Ohne Kopplungscode keine Ausführung.",
            13, 0xFF9CA3AF));
        setContentView(root);
        refresh();
    }

    @Override protected void onResume() {
        super.onResume();
        if (status != null) refresh();
    }

    private void refresh() {
        status.setText(BridgeConfig.armed(this)
            ? "Fernnavigation: EIN · Android-Bedienungshilfe muss ebenfalls eingeschaltet sein."
            : "Fernnavigation: AUS · keine Befehle werden ausgeführt.");
    }

    private TextView label(String s, int size, int color) {
        TextView v = new TextView(this);
        v.setText(s);
        v.setTextSize(size);
        v.setTextColor(color);
        v.setPadding(0, 10, 0, 10);
        return v;
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return b;
    }
}
