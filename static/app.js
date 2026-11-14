const API_BASE = "https://freedom-properly-treatments-allowance.trycloudflare.com";
const input = document.getElementById("reel-urls");
const downloadBtn = document.getElementById("download-btn");
const pasteBtn = document.getElementById("paste-btn");
const statusBox = document.getElementById("status");
const linkCounter = document.getElementById("link-counter");
const queueState = document.getElementById("queue-state");
const guidanceText = document.getElementById("download-guidance-text");
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

  if (count > MAX_LINKS) {
    queueState.dataset.state = "limit";
    queueState.lastChild.textContent = " Link limit exceeded";
    guidanceText.textContent = `Please remove ${count - MAX_LINKS} link${count - MAX_LINKS === 1 ? "" : "s"}. A maximum of ${MAX_LINKS} links is allowed.`;
  } else if (count === 1) {
    queueState.dataset.state = "single";
    queueState.lastChild.textContent = " 1 video ready";
    guidanceText.textContent = "Single download · Your video will be saved as an individual file.";
  } else if (count > 1) {
    queueState.dataset.state = "batch";
    queueState.lastChild.textContent = ` ${count} videos ready`;
    guidanceText.textContent = `Batch download · ${count} videos will be collected into one ZIP bundle.`;
  } else {
    queueState.dataset.state = "empty";
    queueState.lastChild.textContent = " Waiting for links";
    guidanceText.textContent = "One link saves as a video. Add multiple links for a ZIP bundle.";
  }

  if (!downloadBtn.disabled) {
    downloadBtn.querySelector("span").textContent = count > 1 ? "Download ZIP Bundle" : "Download Video";
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
  setStatus(urls.length === 1
    ? "Preparing your video. Keep this tab open…"
    : `Processing ${urls.length} links one by one. Preparing your ZIP bundle…`);

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
      throw new Error((data.error || "The download could not be created.") + failures);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const disposition = response.headers.get("content-disposition") || "";
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    const filename = utf8Match
      ? decodeURIComponent(utf8Match[1])
      : (plainMatch ? plainMatch[1] : (urls.length === 1 ? "ReelGrabber-video" : "ReelGrabber-downloads.zip"));

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    const succeeded = Number(response.headers.get("X-ReelGrabber-Success-Count") || urls.length);
    const total = Number(response.headers.get("X-ReelGrabber-Total-Count") || urls.length);
    const failed = total - succeeded;

    if (urls.length === 1) {
      setStatus("Video downloaded successfully.");
    } else if (failed > 0) {
      setStatus(`ZIP downloaded: ${succeeded} of ${total} videos succeeded. See the report inside the ZIP.`);
    } else {
      setStatus(`ZIP bundle downloaded successfully with ${succeeded} videos.`);
    }
  } catch (error) {
    setStatus(error.message || "Something went wrong. Try again with public Instagram links you are allowed to download.", "error");
  } finally {
    downloadBtn.disabled = false;
    updateLinkCounter();
  }
}

// Downloads start only from an intentional click on the download button.
downloadBtn.addEventListener("click", downloadBatch);
input.addEventListener("input", () => {
  updateLinkCounter();
  if (statusBox.textContent) setStatus("");
});

// Intentionally no Enter/Ctrl+Enter download shortcut: Enter only inserts a newline.
updateLinkCounter();


// Import a user's own Instagram Accounts Center archive in 20 MB chunks.
const archiveInput = document.getElementById("archive-file");
const archiveImportBtn = document.getElementById("archive-import-btn");
const archiveFileName = document.getElementById("archive-file-name");
const archiveFileHint = document.getElementById("archive-file-hint");
const archiveStatus = document.getElementById("archive-status");
const archiveProgressWrap = document.getElementById("archive-progress-wrap");
const archiveProgressLabel = document.getElementById("archive-progress-label");
const archiveProgressValue = document.getElementById("archive-progress-value");
const archiveProgressBar = document.getElementById("archive-progress-bar");
const ARCHIVE_MAX_BYTES = 1024 * 1024 * 1024;
const ARCHIVE_CHUNK_BYTES = 20 * 1024 * 1024;

function setArchiveStatus(message, type = "") {
  archiveStatus.textContent = message;
  archiveStatus.className = "archive-status" + (type ? ` ${type}` : "");
}
function setArchiveProgress(percent, label) {
  archiveProgressWrap.hidden = false;
  archiveProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  archiveProgressValue.textContent = `${Math.round(percent)}%`;
  archiveProgressLabel.textContent = label;
}
archiveInput.addEventListener("change", () => {
  const file = archiveInput.files?.[0];
  archiveImportBtn.disabled = !file;
  archiveProgressWrap.hidden = true;
  setArchiveStatus("");
  if (!file) {
    archiveFileName.textContent = "Choose your Instagram archive ZIP";
    archiveFileHint.textContent = "One ZIP at a time · Up to 1 GB";
    return;
  }
  archiveFileName.textContent = file.name;
  archiveFileHint.textContent = `${(file.size / (1024 * 1024)).toFixed(1)} MB · Ready to import`;
  if (!file.name.toLowerCase().endsWith(".zip")) {
    archiveImportBtn.disabled = true;
    setArchiveStatus("Please select a ZIP file downloaded from Instagram.", "error");
  } else if (file.size <= 0 || file.size > ARCHIVE_MAX_BYTES) {
    archiveImportBtn.disabled = true;
    setArchiveStatus("Choose a non-empty archive up to 1 GB.", "error");
  } else {
    setArchiveStatus("Ready. The archive will be uploaded in small parts.");
  }
});
function saveArchiveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}
archiveImportBtn.addEventListener("click", async () => {
  const file = archiveInput.files?.[0];
  if (!file) { setArchiveStatus("Choose your Instagram archive ZIP first.", "error"); return; }
  if (!file.name.toLowerCase().endsWith(".zip") || file.size <= 0 || file.size > ARCHIVE_MAX_BYTES) {
    setArchiveStatus("Choose a valid ZIP archive up to 1 GB.", "error"); return;
  }
  const totalChunks = Math.ceil(file.size / ARCHIVE_CHUNK_BYTES);
  const uploadId = crypto.randomUUID().replaceAll("-", "");
  archiveImportBtn.disabled = true;
  archiveInput.disabled = true;
  setArchiveStatus("Starting archive import…");
  setArchiveProgress(0, "Preparing upload…");
  try {
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * ARCHIVE_CHUNK_BYTES;
      const end = Math.min(file.size, start + ARCHIVE_CHUNK_BYTES);
      const form = new FormData();
      form.append("upload_id", uploadId);
      form.append("chunk_index", String(index));
      form.append("total_chunks", String(totalChunks));
      form.append("filename", file.name);
      form.append("chunk", file.slice(start, end), `part-${index}.bin`);
      const response = await fetch(`${API_BASE}/api/archive/import`, { method: "POST", body: form });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        const data = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
        throw new Error(data.error || `Archive upload failed at part ${index + 1} (${response.status}). Please retry.`);
      }
      const percent = ((index + 1) / totalChunks) * 100;
      if (index < totalChunks - 1) {
        const progress = await response.json();
        if (progress.complete !== false) throw new Error("Unexpected response while uploading the archive.");
        setArchiveProgress(percent, `Uploading archive part ${index + 1} of ${totalChunks}…`);
      } else {
        if (contentType.includes("application/json")) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "The archive was uploaded but could not be processed.");
        }
        setArchiveProgress(100, "Building your media ZIP…");
        const blob = await response.blob();
        const disposition = response.headers.get("content-disposition") || "";
        const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
        const filename = utf8Match ? decodeURIComponent(utf8Match[1]) : (plainMatch ? plainMatch[1] : "ReelGrabber-Instagram-media.zip");
        saveArchiveBlob(blob, filename);
        setArchiveStatus("Archive ready. Your photos and videos ZIP download has started.", "success");
        setArchiveProgress(100, "Complete");
      }
    }
  } catch (error) {
    setArchiveStatus(error.message || "Archive import failed. Please try again.", "error");
  } finally {
    archiveImportBtn.disabled = !archiveInput.files?.[0];
    archiveInput.disabled = false;
  }
});

// Enter in the Reel links box inserts a newline; only a button click downloads.
