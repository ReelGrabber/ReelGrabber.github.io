const API_BASE = "https://freedom-properly-treatments-allowance.trycloudflare.com";
const input = document.getElementById("reel-urls");
const downloadBtn = document.getElementById("download-btn");
const pasteBtn = document.getElementById("paste-btn");
const statusBox = document.getElementById("status");
const linkCounter = document.getElementById("link-counter");
const MAX_LINKS = 10;

document.getElementById("year").textContent = new Date().getFullYear();

function getLinks() {
  return input.value
    .split(/\r?\n/)
    .map(link => link.trim())
    .filter(Boolean);
}

function updateLinkCounter() {
  const count = getLinks().length;
  linkCounter.textContent = `${count} / ${MAX_LINKS} links`;
  linkCounter.classList.toggle("over-limit", count > MAX_LINKS);

  if (!downloadBtn.disabled) {
    downloadBtn.querySelector("span").textContent =
      count > 1 ? "Download ZIP Bundle" : "Download Video";
  }
}

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = "status" + (type ? ` ${type}` : "");
}

pasteBtn.addEventListener("click", async () => {
  try {
    if (!navigator.clipboard?.readText) throw new Error("Clipboard access unavailable");
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) return setStatus("Your clipboard is empty.");

    const existing = input.value.trim();
    input.value = existing ? `${existing}\n${text}` : text;
    input.focus();
    updateLinkCounter();
    setStatus("Link(s) pasted. Check that there is one link per line.");
  } catch {
    input.focus();
    setStatus("Clipboard access isn't available here. Paste your links into the box.");
  }
});

async function downloadBatch() {
  const urls = getLinks();
  if (!urls.length) {
    setStatus("Paste at least one Instagram link first.", "error");
    input.focus();
    return;
  }
  if (urls.length > MAX_LINKS) {
    setStatus(`Please keep the batch to ${MAX_LINKS} links or fewer.`, "error");
    input.focus();
    return;
  }

  downloadBtn.disabled = true;
  downloadBtn.querySelector("span").textContent = urls.length === 1 ? "Preparing video…" : "Preparing ZIP bundle…";
  setStatus(urls.length === 1 ? "Preparing your video. Keep this tab open..." : `Processing ${urls.length} links one by one. Preparing your ZIP bundle...`);

  try {
    const response = await fetch(`${API_BASE}/api/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls })
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || contentType.includes("application/json")) {
      const data = await response.json().catch(() => ({}));
      const failures = Array.isArray(data.failures) ? ` ${data.failures.join(" | ")}` : "";
      throw new Error((data.error || "The download bundle could not be created.") + failures);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const disposition = response.headers.get("content-disposition") || "";
    const fileMatch = disposition.match(/filename="?([^";]+)"?/i);
    const filename = fileMatch ? fileMatch[1] : "ReelGrabber-downloads.zip";
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    const succeeded = response.headers.get("X-ReelGrabber-Success-Count") || urls.length;
    const total = response.headers.get("X-ReelGrabber-Total-Count") || urls.length;
    const failed = Number(total) - Number(succeeded);
    if (urls.length === 1) {
      setStatus("Video downloaded successfully.");
    } else {
      setStatus(
        failed > 0
          ? `ZIP bundle downloaded: ${succeeded} of ${total} videos succeeded. Details for failed links are inside the ZIP report.`
          : `ZIP bundle downloaded successfully with ${succeeded} videos.`
      );
    }
  } catch (error) {
    setStatus(error.message || "Something went wrong. Try again with public Instagram links you are allowed to download.", "error");
  } finally {
    downloadBtn.disabled = false;
    updateLinkCounter();
  }
}

downloadBtn.addEventListener("click", downloadBatch);
input.addEventListener("input", () => {
  updateLinkCounter();
  if (statusBox.textContent) setStatus("");
});
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    downloadBatch();
  }
});

updateLinkCounter();
