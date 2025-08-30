exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode:405, headers:{"Content-Type":"application/json"}, body: JSON.stringify({error:"Use POST"}) };
    const body = JSON.parse(event.body || "{}");
    const token = process.env.SHIPPO_API_TOKEN || "";
    const live = !!token;
    if (!live) {
      // Demo label
      const tracking = "TRK" + Date.now().toString().slice(-10);
      const label_url = `https://via.placeholder.com/700x300.png?text=DEMO+LABEL+%7C+${tracking}`;
      return { statusCode: 200, headers:{"Content-Type":"application/json"}, body: JSON.stringify({ mode:"demo", tracking, label_url }) };
    }
    if (!body.rate_id) {
      return { statusCode: 400, headers:{"Content-Type":"application/json"}, body: JSON.stringify({ error:"Missing rate_id for live label purchase" }) };
    }
    const resp = await fetch("https://api.goshippo.com/transactions/", {
      method: "POST",
      headers: { "Authorization": `ShippoToken ${token}`, "Content-Type":"application/json" },
      body: JSON.stringify({ rate: body.rate_id, label_file_type:"PNG" })
    });
    const txt = await resp.text();
    if (!resp.ok) return { statusCode: resp.status, headers:{"Content-Type":"application/json"}, body: JSON.stringify({ error:`Shippo error ${resp.status}: ${txt.slice(0,200)}` }) };
    let tx; try{ tx = JSON.parse(txt) } catch(e){ return { statusCode:502, headers:{"Content-Type":"application/json"}, body: JSON.stringify({ error:"Shippo non-JSON response", details:txt.slice(0,200) }) }; }
    if (tx.status && tx.status.toLowerCase()!=="success" && !tx.label_url) {
      return { statusCode: 502, headers:{"Content-Type":"application/json"}, body: JSON.stringify({ error:`Shippo transaction status: ${tx.status}`, details: tx }) };
    }
    return { statusCode: 200, headers:{"Content-Type":"application/json"}, body: JSON.stringify({ mode:"live", tracking: tx.tracking_number || tx.tracking || "", label_url: tx.label_url || "" }) };
  } catch (e) {
    return { statusCode: 500, headers:{"Content-Type":"application/json"}, body: JSON.stringify({ error: String(e) }) };
  }
};
