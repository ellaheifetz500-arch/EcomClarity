const fs = require("fs");
const path = require("path");

function toRad(d){ return d*Math.PI/180; }
function haversineKm(a,b){
  const [lat1,lon1] = a, [lat2,lon2] = b;
  const R=6371; const dLat=toRad(lat2-lat1); const dLon=toRad(lon2-lon1);
  const s1=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(s1));
}
const countryCenter = {
  DE:[51.1657,10.4515], FR:[46.2276,2.2137], ES:[40.4637,-3.7492], NL:[52.1326,5.2913],
  IT:[41.8719,12.5674], GB:[55.3781,-3.4360], US:[39.8283,-98.5795]
};
function baseDistance(from,to){
  const a = countryCenter[from] || countryCenter["DE"];
  const b = countryCenter[to] || countryCenter["FR"];
  return haversineKm(a,b);
}
function dimWeightKg(cmL,cmW,cmH,divisor=5000){ return (cmL*cmW*cmH)/divisor; }

function json(obj, status=200){
  return { statusCode: status, headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" }, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ error: "Use POST" }, 405);
    const body = JSON.parse(event.body||"{}");
    const token = process.env.SHIPPO_API_TOKEN || "";
    const live = !!token;

    // Load warehouses
    const dataPath = path.join(process.cwd(), "data", "warehouses.json");
    const whs = JSON.parse(fs.readFileSync(dataPath, "utf-8")).warehouses||[];

    // Choose origin
    let chosen;
    if (body.origin && body.origin !== "auto") { chosen = whs.find(w=>w.id===body.origin); }
    if (!chosen) {
      const best = whs.map(w => ({ w, d: baseDistance(w.country, body.toCountry) })).sort((a,b)=>a.d-b.d)[0];
      chosen = best?.w || whs[0];
    }

    // Parcel fields
    const p = body.parcel || {};
    const L = +p.length || 20, W = +p.width || 15, H = +p.height || 10;
    const billable = Math.max(+p.weight||1, dimWeightKg(L,W,H));
    const base = baseDistance(chosen.country, body.toCountry);
    const priceBase = 4.0 + 0.35*base + 1.8*billable + 2.5;

    let rates = [];

    if (live) {
      // Shippo: create shipment, return rates with rate_id
      const resp = await fetch("https://api.goshippo.com/shipments/", {
        method: "POST",
        headers: { "Authorization": `ShippoToken ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          address_from: { name:"Warehouse", street1:"-", city: chosen.zip, zip: chosen.zip, country: chosen.country },
          address_to: { name:"Consignee", street1:"-", city: body.toZip || "City", zip: body.toZip || "00000", country: body.toCountry || "DE" },
          parcels: [{
            length: L, width: W, height: H, distance_unit: p.distance_unit || "cm", weight: billable, mass_unit: p.mass_unit || "kg"
          }],
          async: false
        })
      });
      const txt = await resp.text();
      if (!resp.ok) return json({ error:`Shippo error ${resp.status}: ${txt.slice(0,200)}` }, resp.status);
      let shipment; try{ shipment = JSON.parse(txt) }catch(e){ return json({ error:"Shippo non-JSON response", details:txt.slice(0,200) }, 502); }
      rates = (shipment.rates||[]).map(r => ({
        rate_id: r.object_id || r.object_id || null,
        carrier: r.provider || r.carrier || "Carrier",
        service: (r.servicelevel && r.servicelevel.name) || r.service || "",
        amount: parseFloat(r.amount || r.price || 0),
        currency: r.currency || "EUR",
        eta_days: r.estimated_days || null,
        notes: r.duration_terms || ""
      }));
    } else {
      // Demo: generate carriers and filter by allowed
      const providers = [
        { carrier:"DHL", mult:1.00, eta: Math.max(1, Math.round(base/700)+1), notes:"Tracked" },
        { carrier:"UPS", mult:1.08, eta: Math.max(1, Math.round(base/800)+1), notes:"Tracked+pickup" },
        { carrier:"FedEx", mult:1.12, eta: Math.max(1, Math.round(base/900)+1), notes:"Express option" },
        { carrier:"DPD", mult:0.98, eta: Math.max(2, Math.round(base/650)+2), notes:"Predictable ground" },
        { carrier:"Hermes", mult:0.96, eta: Math.max(2, Math.round(base/600)+2), notes:"Economy" },
        { carrier:"GLS", mult:0.95, eta: Math.max(2, Math.round(base/600)+2), notes:"Economy" },
        { carrier:"PostNL", mult:0.97, eta: Math.max(2, Math.round(base/650)+2), notes:"Regional" },
        { carrier:"Royal Mail", mult:0.99, eta: Math.max(2, Math.round(base/650)+2), notes:"Regional/intl" },
        { carrier:"Correos", mult:0.96, eta: Math.max(2, Math.round(base/600)+2), notes:"Regional" },
        { carrier:"Poste Italiane", mult:0.99, eta: Math.max(2, Math.round(base/650)+2), notes:"Regional" }
      ];
      const allowed = new Set((chosen.carriers_allowed||[]));
      rates = providers.filter(pv=>allowed.has(pv.carrier)).map(pv => ({
        rate_id: null,
        carrier: pv.carrier,
        service: pv.eta<=2? "Express":"Economy",
        amount: +(priceBase*pv.mult).toFixed(2),
        currency: "EUR",
        eta_days: pv.eta,
        notes: pv.notes + " (demo)"
      }));
    }

    return json({ mode: live? "live":"demo", chosen, rates });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
};
