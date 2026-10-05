const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const projectRoot = path.resolve(__dirname, '..');
const extensionDir = path.join(projectRoot, 'extension');
const buildDir = path.join(projectRoot, 'build');
const zipPath = path.join(buildDir, 'subtitles.zip');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getAllFiles(dir, baseDir = dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (relPath.startsWith('build') || relPath.endsWith('.zip')) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push({ fullPath, relPath: relPath + '/', isDir: true });
      results = results.concat(getAllFiles(fullPath, baseDir));
    } else {
      results.push({ fullPath, relPath, isDir: false });
    }
  }
  return results;
}

// Minimal standard ZIP archive builder without external dependencies (pure Node.js)
function createZip(files, outZipPath) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const isDir = file.isDir;
    const nameBuffer = Buffer.from(file.relPath, 'utf8');
    let dataBuffer = Buffer.alloc(0);
    let crc = 0;

    if (!isDir) {
      dataBuffer = fs.readFileSync(file.fullPath);
      crc = crc32(dataBuffer);
    }

    const compressed = isDir ? Buffer.alloc(0) : zlib.deflateRawSync(dataBuffer);
    const useDeflate = !isDir && compressed.length < dataBuffer.length;
    const method = isDir ? 0 : (useDeflate ? 8 : 0);
    const body = isDir ? Buffer.alloc(0) : (useDeflate ? compressed : dataBuffer);

    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (Math.floor(now.getSeconds() / 2));
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(body.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localHeaders.push(localHeader, nameBuffer, body);

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(body.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(isDir ? 0x10 : 0x20, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralHeaders.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + body.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  centralHeaders.forEach(b => { centralDirSize += b.length; });

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  const allBuffers = localHeaders.concat(centralHeaders, [eocd]);
  const tempPath = outZipPath + '.tmp.' + Date.now();
  fs.writeFileSync(tempPath, Buffer.concat(allBuffers));
  fs.renameSync(tempPath, outZipPath);
}

// Fast CRC32 calculation table
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function build(reason = '') {
  ensureDir(buildDir);
  const files = getAllFiles(extensionDir);
  createZip(files, zipPath);
  const now = new Date().toTimeString().split(' ')[0];
  if (reason) {
    console.log(`[${now}] (${reason}) -> Rebuilt subtitles.zip (${files.length} entries)`);
  } else {
    console.log(`[${now}] -> Archive created: ${zipPath} (${files.length} entries)`);
  }
}

const isWatch = process.argv.includes('--watch');

console.log('Initial build...');
build();

if (isWatch) {
  console.log(`Watching ${extensionDir} for changes (Node.js cross-platform watcher)...`);
  let timer = null;

  fs.watch(extensionDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const normalized = filename.replace(/\\/g, '/');
    if (normalized.startsWith('build') || normalized.endsWith('.zip')) {
      return;
    }

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      build(`${eventType}: ${normalized}`);
    }, 300);
  });
}
