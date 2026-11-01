import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  min_stock_level: number;
  expiry_date: string | null;
  unit: string;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Load alert settings
    const { data: settings, error: settingsError } = await supabase
      .from("alert_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (settingsError) throw settingsError;
    if (!settings) {
      return new Response(
        JSON.stringify({ error: "No alert settings configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load all active products
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, sku, stock_quantity, min_stock_level, expiry_date, unit")
      .eq("status", "active");

    if (productsError) throw productsError;

    const alertsToSend: { product_id: string; alert_type: string; message: string }[] = [];
    const warningDays = settings.expiry_warning_days;

    for (const product of products as ProductRow[]) {
      const stock = Number(product.stock_quantity);
      const minLevel = Number(product.min_stock_level);
      const dl = daysUntil(product.expiry_date);

      // Low stock alert
      if (minLevel > 0 && stock <= minLevel) {
        alertsToSend.push({
          product_id: product.id,
          alert_type: "low_stock",
          message: `LOW STOCK: ${product.name} (${product.sku}) — ${stock} ${product.unit} remaining (min: ${minLevel}). Please restock.`,
        });
      }

      // Expiry alerts
      if (dl !== null) {
        if (dl < 0) {
          alertsToSend.push({
            product_id: product.id,
            alert_type: "expired",
            message: `EXPIRED: ${product.name} (${product.sku}) — expired ${Math.abs(dl)} day(s) ago. Remove from shelves.`,
          });
        } else if (dl <= warningDays) {
          alertsToSend.push({
            product_id: product.id,
            alert_type: "near_expiry",
            message: `EXPIRING SOON: ${product.name} (${product.sku}) — expires in ${dl} day(s) (${product.expiry_date}). Prioritize sale or discount.`,
          });
        }
      }
    }

    if (alertsToSend.length === 0) {
      return new Response(
        JSON.stringify({ success: true, alerts_sent: 0, message: "No alerts to send — all items are within safe thresholds." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log all alerts to alert_log (dashboard channel)
    const logEntries = alertsToSend.map((a) => ({
      product_id: a.product_id,
      alert_type: a.alert_type,
      message: a.message,
      channel: "dashboard" as const,
      status: "sent" as const,
    }));

    const { error: logError } = await supabase
      .from("alert_log")
      .insert(logEntries);

    if (logError) {
      console.error("Failed to log alerts:", logError.message);
    }

    // Send WhatsApp alerts if enabled
    let whatsappSent = 0;
    let whatsappFailed = 0;

    if (settings.whatsapp_enabled && settings.whatsapp_number) {
      const whatsappApiKey = Deno.env.get("WHATSAPP_API_KEY");
      const whatsappApiUrl = Deno.env.get("WHATSAPP_API_URL");

      if (whatsappApiKey && whatsappApiUrl) {
        // Build a consolidated message
        const messageLines = alertsToSend.map((a) => `⚠️ ${a.message}`);
        const fullMessage = `*FreshStock Alert*\n\n${messageLines.join("\n\n")}\n\n_Total: ${alertsToSend.length} alert(s)_`;

        try {
          const waResponse = await fetch(`${whatsappApiUrl}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${whatsappApiKey}`,
            },
            body: JSON.stringify({
              to: settings.whatsapp_number,
              message: fullMessage,
            }),
          });

          if (waResponse.ok) {
            whatsappSent = alertsToSend.length;
            // Update log entries to whatsapp channel + sent
            await supabase
              .from("alert_log")
              .insert(alertsToSend.map((a) => ({
                product_id: a.product_id,
                alert_type: a.alert_type,
                message: a.message,
                channel: "whatsapp",
                status: "sent",
              })));
          } else {
            whatsappFailed = alertsToSend.length;
            const errBody = await waResponse.text();
            console.error("WhatsApp API error:", errBody);
            await supabase
              .from("alert_log")
              .insert(alertsToSend.map((a) => ({
                product_id: a.product_id,
                alert_type: a.alert_type,
                message: a.message,
                channel: "whatsapp",
                status: "failed",
              })));
          }
        } catch (err) {
          whatsappFailed = alertsToSend.length;
          console.error("WhatsApp send error:", err);
        }
      } else {
        // WhatsApp enabled but no API key configured — log as failed
        whatsappFailed = alertsToSend.length;
        console.warn("WhatsApp alerts enabled but WHATSAPP_API_KEY or WHATSAPP_API_URL not configured");
        await supabase
          .from("alert_log")
          .insert(alertsToSend.map((a) => ({
            product_id: a.product_id,
            alert_type: a.alert_type,
            message: a.message,
            channel: "whatsapp",
            status: "failed",
          })));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alerts_sent: whatsappSent || alertsToSend.length,
        dashboard_alerts: alertsToSend.length,
        whatsapp_sent: whatsappSent,
        whatsapp_failed: whatsappFailed,
        whatsapp_enabled: settings.whatsapp_enabled,
        message: whatsappSent > 0
          ? `${whatsappSent} WhatsApp alert(s) sent successfully.`
          : settings.whatsapp_enabled
          ? `${alertsToSend.length} alert(s) logged. WhatsApp delivery failed — check API configuration.`
          : `${alertsToSend.length} alert(s) logged to dashboard. WhatsApp is disabled.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
