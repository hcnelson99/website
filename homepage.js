let canvas;
let ctx;

let r = Math.random;

function rr(l, h) {
  return l + r() * (h - l);
}

function b(x) {
  return r() < x;
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function bsp(depth, x0, y0, x1, y1) {
  if (depth == 0) return;

  ctx.strokeStyle = '#ff0000';
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  await sleep(30);

  let xm = x0 + (x1 - x0) * rr(.2, .8);
  let ym = y0 + (y1 - y0) * rr(.2, .8);

  if (b(0.7)) 
    await bsp(depth - 1, x0, y0, xm, ym);
  if (b(0.7)) 
    await bsp(depth - 1, xm, y0, x1, ym);
  if (b(0.7)) 
    await bsp(depth - 1, xm, ym, x1, y1);
  if (b(0.7)) 
    await bsp(depth - 1, x0, ym, xm, y1);
}

window.onload = function() {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext('2d');

  bsp(5, 0, 0, canvas.width, canvas.height);
};
