import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SaleItem {
  sku: string;
  barcode?: string;
  quantity: number;
}

interface WebhookPayload {
  pos_id?: string;
  invoice?: string;
  items: SaleItem[];
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body: WebhookPayload = await req.json();

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'items' array in payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { sku: string; status: string; message: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const item of body.items) {
      if (!item.sku || !item.quantity || item.quantity <= 0) {
        results.push({
          sku: item.sku ?? "unknown",
          status: "error",
          message: "Missing SKU or invalid quantity",
        });
        errorCount++;
        continue;
      }

      // Find product by SKU (or barcode as fallback)
      let productQuery = supabase
        .from("products")
        .select("id, name, sku, stock_quantity, unit, status")
        .eq("sku", item.sku)
        .maybeSingle();

      const { data: product, error: queryError } = await productQuery;

      if (queryError) {
        results.push({ sku: item.sku, status: "error", message: queryError.message });
        errorCount++;
        continue;
      }

      if (!product) {
        results.push({ sku: item.sku, status: "error", message: "Product not found" });
        errorCount++;
        continue;
      }

      if (product.status !== "active") {
        results.push({ sku: item.sku, status: "error", message: `Product is ${product.status}` });
        errorCount++;
        continue;
      }

      const currentStock = Number(product.stock_quantity);
      const saleQty = Number(item.quantity);
      const newStock = currentStock - saleQty;

      if (newStock < 0) {
        results.push({
          sku: item.sku,
          status: "error",
          message: `Insufficient stock (have ${currentStock}, sold ${saleQty})`,
        });
        errorCount++;
        continue;
      }

      // Update product stock
      const { error: updateError } = await supabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", product.id);

      if (updateError) {
        results.push({ sku: item.sku, status: "error", message: updateError.message });
        errorCount++;
        continue;
      }

      // Log the stock movement
      const { error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: product.id,
          movement_type: "sale",
          quantity: -saleQty,
          reference: body.invoice ?? body.pos_id ?? null,
          note: `POS sale from ${body.pos_id ?? "unknown POS"}`,
        });

      if (movementError) {
        results.push({ sku: item.sku, status: "warning", message: `Stock updated but movement log failed: ${movementError.message}` });
      } else {
        results.push({
          sku: item.sku,
          status: "success",
          message: `Stock reduced from ${currentStock} to ${newStock}`,
        });
        successCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        invoice: body.invoice ?? null,
        processed: body.items.length,
        succeeded: successCount,
        failed: errorCount,
        results,
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
