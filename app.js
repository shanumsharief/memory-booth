const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const video = $('#cameraVideo');
const cameraWindow = $('.camera-window');
const cameraPlaceholder = $('#cameraPlaceholder');
const cameraStatusPill = $('#cameraStatusPill');
const boothStatus = $('#boothStatus');
const startCameraButton = $('#startCameraButton');
const shutterButton = $('#shutterButton');
const countdown = $('#countdown');
const cameraFlash = $('#cameraFlash');
const resultPanel = $('#resultPanel');
const resultImage = $('#resultImage');
const downloadButton = $('#downloadButton');
const retakeButton = $('#retakeButton');
const captureCanvas = $('#captureCanvas');
const savedAlbumItems = $('#savedAlbumItems');
const albumCount = $('#albumCount');
const printCopies = $('#printCopies');
const printDownloadButton = $('#printDownloadButton');
const curtainTransition = $('#curtainTransition');

let stream = null;
let capturedPhotos = [];
let isCapturing = false;
let currentFilter = 'keepsake';
let currentSticker = 'star';
let currentStrip = '';
const STORAGE_KEY = 'memory-booth-strips';

const FILTER_PRESETS = {
  keepsake: { filter: 'sepia(.18) saturate(.72) contrast(.88) brightness(1.03)', wash: 'rgba(189, 131, 96, .13)', screen: 'rgba(112, 82, 65, .12)' },
  'dusty-rose': { filter: 'sepia(.28) saturate(.84) hue-rotate(326deg) contrast(.86) brightness(1.04)', wash: 'rgba(185, 111, 104, .16)', screen: 'rgba(151, 94, 91, .11)' },
  'olive-film': { filter: 'sepia(.34) saturate(.62) hue-rotate(35deg) contrast(.9) brightness(.99)', wash: 'rgba(126, 130, 91, .15)', screen: 'rgba(93, 108, 83, .12)' },
  'faded-ink': { filter: 'grayscale(.38) sepia(.22) saturate(.52) contrast(.82) brightness(1.08)', wash: 'rgba(171, 158, 137, .15)', screen: 'rgba(126, 111, 96, .15)' }
};

function setStatus(message) {
  boothStatus.textContent = message;
}

function setCameraLabel(label) {
  cameraStatusPill.textContent = label;
}

function dateLabel(date = new Date()) {
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replaceAll('/', ' / ');
}

function scrollToBooth() {
  $('#booth').scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
}

async function startCamera({ skipScroll = false } = {}) {
  if (!skipScroll) scrollToBooth();
  if (stream) {
    setStatus('The curtain is open. Press the red button when you are ready.');
    shutterButton.disabled = false;
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraLabel('camera unavailable');
    setStatus('This browser does not offer camera access. You can still browse the album, but the booth needs a camera to make a strip.');
    return;
  }
  startCameraButton.disabled = true;
  startCameraButton.querySelector('span').textContent = 'opening...';
  setStatus('Asking the camera to join us…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 960 } }
    });
    video.srcObject = stream;
    await video.play();
    cameraWindow.classList.add('camera-ready');
    setCameraLabel('camera ready');
    shutterButton.disabled = false;
    startCameraButton.querySelector('span').textContent = 'curtain open';
    setStatus('The booth is ready. Four flashes, one little strip.');
  } catch (error) {
    stream = null;
    cameraWindow.classList.remove('camera-ready');
    shutterButton.disabled = true;
    startCameraButton.disabled = false;
    startCameraButton.querySelector('span').textContent = 'open the curtain';
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
      setCameraLabel('permission needed');
      setStatus('The booth needs camera permission to take your photos. You can allow it in your browser’s address-bar settings, then try again.');
    } else if (error?.name === 'NotFoundError') {
      setCameraLabel('no camera found');
      setStatus('I could not find a camera on this device. Try the booth on a phone or computer with a camera attached.');
    } else {
      setCameraLabel('camera error');
      setStatus('The camera could not open just now. Please try again, or check that another app is not using it.');
    }
  }
}

async function enterBooth() {
  curtainTransition.classList.add('active', 'opening');
  // Put the real booth behind the closed curtains first. When the panels part,
  // the camera frame is what appears—not a flash to the next page afterward.
  scrollToBooth();
  await sleep(prefersReducedMotion ? 40 : 620);
  startCamera({ skipScroll: true });
  await sleep(prefersReducedMotion ? 40 : 420);
  curtainTransition.classList.remove('active', 'opening');
}

function resetCountdown() {
  countdown.classList.remove('counting');
  void countdown.offsetWidth;
}

async function showCountdown(number) {
  resetCountdown();
  countdown.textContent = number;
  countdown.classList.add('counting');
  await sleep(prefersReducedMotion ? 280 : 850);
}

function showFlash() {
  cameraFlash.classList.remove('flash');
  void cameraFlash.offsetWidth;
  cameraFlash.classList.add('flash');
}

function drawCover(ctx, source, x, y, width, height) {
  const sourceWidth = source.videoWidth || source.width;
  const sourceHeight = source.videoHeight || source.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0, sy = 0, sw = sourceWidth, sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  ctx.drawImage(source, sx, sy, sw, sh, x, y, width, height);
}

function captureFrame() {
  const width = 720;
  const height = 540;
  captureCanvas.width = width;
  captureCanvas.height = height;
  const ctx = captureCanvas.getContext('2d');
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  drawCover(ctx, video, 0, 0, width, height);
  ctx.restore();
  ctx.fillStyle = 'rgba(207, 156, 112, .11)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(35, 16, 12, .07)';
  ctx.fillRect(0, 0, width, height);
  return captureCanvas.toDataURL('image/jpeg', .88);
}

async function beginSequence() {
  if (isCapturing || !stream) return;
  isCapturing = true;
  capturedPhotos = [];
  shutterButton.disabled = true;
  startCameraButton.disabled = true;
  setCameraLabel('making a strip');
  setStatus('Find your face. The first flash is coming…');
  for (let index = 0; index < 4; index += 1) {
    for (let count = 3; count > 0; count -= 1) {
      await showCountdown(count);
    }
    showFlash();
    capturedPhotos.push(captureFrame());
    setStatus(`Flash ${index + 1} of 4 saved. ${index < 3 ? 'One more little pose…' : 'Putting your strip together…'}`);
    await sleep(prefersReducedMotion ? 260 : 720);
  }
  await finishStrip();
}

function addGrain(ctx, x, y, width, height, amount = 260) {
  ctx.save();
  for (let i = 0; i < amount; i += 1) {
    const px = x + Math.random() * width;
    const py = y + Math.random() * height;
    const alpha = .035 + Math.random() * .12;
    const tone = Math.random() > .52 ? '45,18,13' : '255,247,229';
    ctx.fillStyle = `rgba(${tone},${alpha})`;
    const size = Math.random() > .92 ? 2 : 1;
    ctx.fillRect(px, py, size, size);
  }
  ctx.restore();
}

function drawStripImage(ctx, image, x, y, width, height, frameIndex) {
  ctx.save();
  const preset = FILTER_PRESETS[currentFilter] || FILTER_PRESETS.keepsake;
  const exposures = [.98, 1.04, .96, 1.01];
  ctx.filter = `${preset.filter} brightness(${exposures[frameIndex]})`;
  drawCover(ctx, image, x, y, width, height);
  ctx.filter = 'none';
  ctx.fillStyle = preset.wash;
  ctx.fillRect(x, y, width, height);
  // A soft screen wash lifts the blacks like an old print, while the dark veil
  // keeps the edges a touch muddy and imperfect instead of digitally crisp.
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = preset.screen;
  ctx.fillRect(x, y, width, height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(36, 17, 13, .07)';
  ctx.fillRect(x, y, width, height);
  addGrain(ctx, x, y, width, height, 150);
  ctx.restore();
}

function drawSticker(ctx, type, x, y) {
  if (type === 'none') return;
  ctx.save();
  ctx.translate(x, y);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9c4c3d';
  ctx.strokeStyle = '#9c4c3d';
  if (type === 'stamp') {
    ctx.rotate(-.08);
    ctx.fillStyle = 'rgba(156, 76, 61, .08)';
    ctx.fillRect(-36, -22, 72, 44);
    ctx.strokeRect(-36, -22, 72, 44);
    ctx.fillStyle = '#9c4c3d';
    ctx.font = '11px Courier New, monospace';
    ctx.fillText('KEEP THIS', 0, -4);
    ctx.font = '9px Courier New, monospace';
    ctx.fillText('✦  POST  ✦', 0, 11);
  } else {
    ctx.font = type === 'flower' ? '32px Georgia, serif' : '33px Georgia, serif';
    ctx.fillText(type === 'heart' ? '♡' : type === 'flower' ? '✿' : '✦', 0, 0);
  }
  ctx.restore();
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function makeStrip() {
  const width = 560;
  const border = 34;
  const photoWidth = width - border * 2;
  const photoHeight = Math.round(photoWidth * .75);
  const gap = 18;
  const top = 44;
  const footer = 92;
  const height = top + (photoHeight * 4) + (gap * 3) + footer;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6edd9';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(219,190,148,.19)';
  ctx.fillRect(0, 0, width, height);
  addGrain(ctx, 0, 0, width, height, 1300);

  for (let index = 0; index < capturedPhotos.length; index += 1) {
    const image = await loadImage(capturedPhotos[index]);
    const y = top + index * (photoHeight + gap);
    drawStripImage(ctx, image, border, y, photoWidth, photoHeight, index);
    ctx.strokeStyle = 'rgba(45,18,13,.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(border + 2, y + 2, photoWidth - 4, photoHeight - 4);
  }

  const now = new Date();
  ctx.fillStyle = '#4a261d';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText('MEMORY BOOTH', width / 2, height - 52);
  ctx.font = '17px Courier New, monospace';
  ctx.fillStyle = '#8b6252';
  ctx.fillText(`${dateLabel(now)}  ·  KEEP CLOSE`, width / 2, height - 25);
  ctx.beginPath();
  ctx.arc(width - 65, height - 43, 20, 0, Math.PI * 2);
  ctx.strokeStyle = '#9c4c3d';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = '13px Courier New, monospace';
  ctx.fillStyle = '#9c4c3d';
  ctx.fillText('✦', width - 65, height - 39);
  drawSticker(ctx, currentSticker, 82, height - 43);
  addGrain(ctx, 0, 0, width, height, 1700);
  return canvas.toDataURL('image/png');
}

async function makePrintSheet(stripSource, copies = 4) {
  const image = await loadImage(stripSource);
  const width = 1700;
  const height = 2200;
  const margin = 110;
  const header = 145;
  const footer = 100;
  const gap = 48;
  const columns = copies === 1 ? 1 : 2;
  const rows = Math.ceil(copies / columns);
  const availableWidth = width - margin * 2 - gap * (columns - 1);
  const availableHeight = height - margin * 2 - header - footer - gap * (rows - 1);
  const cellWidth = availableWidth / columns;
  const cellHeight = availableHeight / rows;
  const scale = Math.min(cellWidth / image.width, cellHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3e8d0';
  ctx.fillRect(0, 0, width, height);
  addGrain(ctx, 0, 0, width, height, 2800);
  ctx.fillStyle = '#4a261d';
  ctx.textAlign = 'left';
  ctx.font = 'bold 32px Georgia, serif';
  ctx.fillText('MEMORY BOOTH / PRINT SHEET', margin, margin + 8);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8b6252';
  ctx.font = '19px Courier New, monospace';
  ctx.fillText(`${copies} STRIPS · ${dateLabel()}`, width - margin, margin + 8);

  for (let index = 0; index < copies; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = margin + col * (cellWidth + gap);
    const cellY = margin + header + row * (cellHeight + gap);
    const x = cellX + (cellWidth - drawWidth) / 2;
    const y = cellY + (cellHeight - drawHeight) / 2;
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(139,98,82,.35)';
    ctx.strokeRect(x - 12, y - 12, drawWidth + 24, drawHeight + 24);
    ctx.restore();
    ctx.drawImage(image, x, y, drawWidth, drawHeight);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8b6252';
  ctx.font = '18px Courier New, monospace';
  ctx.fillText('cut on the dotted lines · keep one · give one away', width / 2, height - margin + 9);
  addGrain(ctx, 0, 0, width, height, 3200);
  return canvas.toDataURL('image/png');
}

function updateStripLinks(strip) {
  currentStrip = strip;
  resultImage.src = strip;
  resultImage.alt = `Your finished four-photo memory strip dated ${dateLabel()}`;
  downloadButton.href = strip;
  downloadButton.download = `memory-booth-${dateLabel().replaceAll(' / ', '-')}.png`;
}

async function updatePrintSheet() {
  if (!currentStrip) return;
  const sheet = await makePrintSheet(currentStrip, Number(printCopies.value));
  printDownloadButton.href = sheet;
  printDownloadButton.download = `memory-booth-print-sheet-${printCopies.value}-up.png`;
}

async function restyleCurrentStrip() {
  if (!capturedPhotos.length || isCapturing) return;
  setStatus('Developing that new little look…');
  const strip = await makeStrip();
  updateStripLinks(strip);
  await updatePrintSheet();
  setStatus('Your strip has a fresh coat of vintage ink.');
}

function readSavedStrips() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function writeSavedStrip(dataUrl) {
  try {
    const saved = readSavedStrips();
    saved.unshift({ dataUrl, date: dateLabel(), caption: 'made just now · keep close' });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 5)));
    return true;
  } catch {
    // A private browsing quota or disabled storage should never erase a strip
    // that has already been developed in memory.
    return false;
  }
}

function addSavedCard(item, index) {
  const article = document.createElement('article');
  article.className = 'album-card saved-card';
  article.style.transform = `rotate(${index % 2 ? 6 : -5}deg)`;
  const tape = document.createElement('div');
  tape.className = 'tape tape-card-one';
  const image = document.createElement('img');
  image.className = 'album-photo saved-photo';
  image.src = item.dataUrl;
  image.alt = `Saved memory strip from ${item.date}`;
  const footer = document.createElement('div');
  footer.className = 'album-card-footer';
  const label = document.createElement('span');
  label.textContent = 'from the booth';
  const date = document.createElement('span');
  date.textContent = item.date;
  footer.append(label, date);
  article.append(tape, image, footer);
  savedAlbumItems.append(article);
}

function renderAlbum() {
  savedAlbumItems.replaceChildren();
  const saved = readSavedStrips();
  $$('.starter-memory').forEach((card) => { card.hidden = saved.length > 0; });
  $('.album-stage').classList.toggle('has-real-memories', saved.length > 0);
  saved.forEach(addSavedCard);
  const total = 3 + saved.length;
  albumCount.textContent = `${String(total).padStart(2, '0')} memories`;
}

async function finishStrip() {
  try {
    const strip = await makeStrip();
    updateStripLinks(strip);
    await updatePrintSheet();
    writeSavedStrip(strip);
    renderAlbum();
    resultPanel.hidden = false;
    setStatus('Your strip is ready. It turned out beautifully imperfect.');
    setCameraLabel('strip ready');
    resultPanel.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
  } catch {
    setStatus('The strip did not develop this time. Please try the four flashes again.');
  } finally {
    isCapturing = false;
    shutterButton.disabled = false;
    startCameraButton.disabled = false;
  }
}

function retake() {
  resultPanel.hidden = true;
  capturedPhotos = [];
  setCameraLabel('camera ready');
  setStatus('Fresh film. Press the red button when you are ready.');
  scrollToBooth();
}

$$('[data-open-booth]').forEach((button) => button.addEventListener('click', enterBooth));
startCameraButton.addEventListener('click', startCamera);
shutterButton.addEventListener('click', beginSequence);
retakeButton.addEventListener('click', retake);
printCopies.addEventListener('change', updatePrintSheet);

$('#filterOptions').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  currentFilter = button.dataset.filter;
  $$('#filterOptions .studio-chip').forEach((chip) => chip.classList.toggle('active', chip === button));
  await restyleCurrentStrip();
});

$('#stickerOptions').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-sticker]');
  if (!button) return;
  currentSticker = button.dataset.sticker;
  $$('#stickerOptions .studio-chip').forEach((chip) => chip.classList.toggle('active', chip === button));
  await restyleCurrentStrip();
});

$$('.nav-tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.nav-tab').forEach((item) => item.classList.remove('active'));
  tab.classList.add('active');
}));

window.addEventListener('beforeunload', () => {
  stream?.getTracks().forEach((track) => track.stop());
});

renderAlbum();
