import fs from "fs";

export async function downloadOrReadFileBuffer(pathOrUrl) {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    const res = await fetch(pathOrUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch ${pathOrUrl}: ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  return fs.readFileSync(pathOrUrl);
}
