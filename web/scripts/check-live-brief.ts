const base = "https://fleet-dolphin-gaining.cohesivity.app";
const html = await fetch(base + "/").then((r) => r.text());
const urls = [...html.matchAll(/\/_next\/static\/[^"'\\\s>]+\.js/g)].map((m) => m[0]);
console.log("chunks", urls.length);
let found = false;
for (const u of urls) {
  const b = await fetch(base + u).then((r) => r.text());
  const hasBrief = b.includes("Brief") && b.includes("Name the video");
  const hasOld =
    b.includes("Next: Media") ||
    (b.includes("grid-cols-5") && b.includes("Optional person, object"));
  if (hasBrief) {
    console.log("OK Brief merge in", u);
    found = true;
    break;
  }
  if (hasOld) console.log("OLD 5-step Media tab in", u);
}
if (!found) console.log("Brief merge markers not found");
