import json, urllib.request
body = json.dumps({"channel":"https://www.youtube.com/@GrowthX","topic":"channel"}).encode()
req = urllib.request.Request("http://localhost:1382/api/channel-profile", data=body, headers={"Content-Type":"application/json"})
with urllib.request.urlopen(req, timeout=180) as r:
    raw = r.read().decode()
    open(r"C:\Users\MasterUnion\Downloads\thumbnail-generator\local-api-out.json","w",encoding="utf-8").write(raw)
    d = json.loads(raw)
    print("STATUS", r.status)
    print("channelName", (d.get("profile") or {}).get("channelName"))
