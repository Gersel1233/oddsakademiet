/* Spiis admin /ny/: loads the shared admin (../js/admin.js) with one change
   for the new site: a news picture keeps its own shape (a phone poster
   stays tall, 9:16) instead of being cut to a wide 3:2. It is only made
   lighter: the long side at most 1920 px. The live admin is not touched.
   If the shared code ever changes so the change no longer fits, the admin
   loads exactly as it is. */
(() => {
  const src = document.currentScript.dataset.src;
  const crop = `        if (srcRatio > ratio) { sw = Math.round(img.height * ratio); sx = Math.round((img.width - sw) / 2); }
        else { sh = Math.round(img.width / ratio); sy = Math.round((img.height - sh) / 2); }
        const w = Math.min(maxW, sw);
        const h = Math.round(w / ratio);`;
  const keep = `        void srcRatio; void ratio; void maxW;
        const fit = Math.min(1, 1920 / Math.max(img.width, img.height));
        const w = Math.round(img.width * fit);
        const h = Math.round(img.height * fit);`;
  const add = (code) => { const s = document.createElement('script'); s.textContent = code + '\n//# sourceURL=' + src; document.body.append(s); };
  const plain = () => { const s = document.createElement('script'); s.src = src; s.onload = () => document.dispatchEvent(new Event('spiis-admin-ready')); document.body.append(s); };
  fetch(src, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : Promise.reject())).then((code) => {
    add(code.includes(crop) ? code.replace(crop, keep) : code);
    document.dispatchEvent(new Event('spiis-admin-ready'));
  }).catch(plain);
})();
