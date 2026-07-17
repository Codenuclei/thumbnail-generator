function hexToRgb(hex) {
  const normalized = String(hex || "#ffffff").replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  const num = parseInt(value, 16);
  if (Number.isNaN(num)) return { r: 1, g: 1, b: 1 };
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

async function loadFont(family, style) {
  try {
    await figma.loadFontAsync({ family, style });
    return { family, style };
  } catch {
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    return { family: "Inter", style: "Bold" };
  }
}

async function loadImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status})`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const image = figma.createImage(bytes);
  return image.hash;
}

async function createBadge(layer) {
  const frame = figma.createFrame();
  frame.name = layer.name || "Badge";
  frame.resize(layer.width || 160, layer.height || 48);
  frame.x = layer.x || 0;
  frame.y = layer.y || 0;
  frame.fills = [{ type: "SOLID", color: hexToRgb(layer.fill || "#ff3e00") }];
  if (layer.cornerRadius) frame.cornerRadius = layer.cornerRadius;
  if (typeof layer.opacity === "number") frame.opacity = layer.opacity;

  if (layer.characters) {
    const text = figma.createText();
    const font = await loadFont("Inter", "Bold");
    text.fontName = font;
    text.characters = String(layer.characters);
    text.fontSize = layer.fontSize || 24;
    text.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    text.textAlignHorizontal = "CENTER";
    text.textAlignVertical = "CENTER";
    text.resize(frame.width - 8, frame.height - 8);
    text.x = 4;
    text.y = 4;
    frame.appendChild(text);
  }
  return frame;
}

async function importDocument(doc) {
  const frame = figma.createFrame();
  frame.name = doc.title || "Thumbnail Studio";
  frame.resize(doc.width || 1280, doc.height || 720);
  frame.clipsContent = true;

  if (doc.backgroundImageUrl) {
    const rect = figma.createRectangle();
    rect.name = "Background";
    rect.resize(frame.width, frame.height);
    rect.fills = [
      {
        type: "IMAGE",
        scaleMode: "FILL",
        imageHash: await loadImage(doc.backgroundImageUrl),
      },
    ];
    frame.appendChild(rect);
  }

  for (const layer of doc.layers || []) {
    if (layer.type === "TEXT" && layer.characters) {
      const text = figma.createText();
      const font = await loadFont(layer.fontFamily || "Inter", "Bold");
      text.fontName = font;
      text.characters = String(layer.characters);
      text.fontSize = layer.fontSize || 48;
      text.x = layer.x || 0;
      text.y = layer.y || 0;
      text.resize(layer.width || 400, layer.height || 80);
      text.textAlignHorizontal = layer.textAlign || "CENTER";
      text.fills = [{ type: "SOLID", color: hexToRgb(layer.fill || "#ffffff") }];
      if (typeof layer.opacity === "number") text.opacity = layer.opacity;
      if (layer.name) text.name = layer.name;
      frame.appendChild(text);
      continue;
    }

    if (layer.type === "IMAGE" && layer.imageUrl && !String(layer.imageUrl).startsWith("data:")) {
      const rect = figma.createRectangle();
      rect.name = layer.name || "Image";
      rect.resize(layer.width || 200, layer.height || 200);
      rect.x = layer.x || 0;
      rect.y = layer.y || 0;
      rect.fills = [
        {
          type: "IMAGE",
          scaleMode: "FIT",
          imageHash: await loadImage(layer.imageUrl),
        },
      ];
      if (typeof layer.opacity === "number") rect.opacity = layer.opacity;
      frame.appendChild(rect);
      continue;
    }

    if (layer.type === "FRAME" && layer.characters) {
      frame.appendChild(await createBadge(layer));
      continue;
    }

    if (layer.type === "RECTANGLE" || layer.type === "ELLIPSE" || layer.type === "FRAME") {
      const node =
        layer.type === "ELLIPSE" ? figma.createEllipse() : figma.createRectangle();
      node.name = layer.name || layer.type;
      node.resize(layer.width || 100, layer.height || 100);
      node.x = layer.x || 0;
      node.y = layer.y || 0;
      node.fills = [{ type: "SOLID", color: hexToRgb(layer.fill || "#ffffff") }];
      if (layer.cornerRadius && "cornerRadius" in node) {
        node.cornerRadius = layer.cornerRadius;
      }
      if (typeof layer.opacity === "number") node.opacity = layer.opacity;
      frame.appendChild(node);
    }
  }

  figma.currentPage.appendChild(frame);
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
}

figma.showUI(__html__, { width: 440, height: 280 });

figma.ui.onmessage = async (msg) => {
  if (msg.type !== "import-url" || !msg.url) return;
  try {
    const response = await fetch(String(msg.url).trim());
    if (!response.ok) throw new Error(`Fetch failed (${response.status})`);
    const doc = await response.json();
    await importDocument(doc);
    figma.ui.postMessage({ type: "done" });
    figma.closePlugin("Imported thumbnail layers");
  } catch (error) {
    figma.ui.postMessage({
      type: "error",
      message: error && error.message ? error.message : "Import failed",
    });
  }
};
