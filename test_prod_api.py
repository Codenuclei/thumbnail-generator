import json, urllib.request
body = json.dumps({"channel":"https://www.youtube.com/@GrowthX","topic":"channel"}).encode()
url = "https://fleet-dolphin-gaining.cohesivity.app/api/channel-profile"
req = urllib.request.Request(url, data=body, headers={"Content-Type":"application/json"})
with urllib.request.urlopen(req, timeout=180) as r:
    raw = r.read().decode()
    open(r"C:\Users\MasterUnion\Downloads\thumbnail-generator\prod-api-out.json","w",encoding="utf-8").write(raw)
    d = json.loads(raw)
    print("STATUS", r.status)
    print("channelName", (d.get("profile") or {}).get("channelName"))
