const width = 768;
const height = width;
const gridSize = 64;

const rows = height / gridSize;
const cols = width / gridSize;

let player_row = rows / 2;
let player_col = cols / 2;

function cg(x) {
  return x * gridSize + gridSize / 2;
}

let rope = [[cg(player_col), cg(player_row)] ];

let canvas;
let ctx;

function line(x0, y0, x1, y1, strokeStyle) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = 1;
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();
}

function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI)
  ctx.fillStyle = 'red';
  ctx.fill();
}


function draw_rope() {

  for (let i = 0; i < rope.length - 1; i++) {
    var r1 = rope[i];
    var r2 = rope[i + 1];
    line(r1[0], r1[1], r2[0], r2[1], 'brown');
  }
}

function render() {
  ctx.clearRect(0, 0, width, height);

  for (let row = 0; row < rows; row++) {
    line(0, row * gridSize, width, row * gridSize, 'black');
  }
  for (let col = 0; col < cols; col++) {
    line(col * gridSize, 0, col * gridSize, height, 'black');
  }

  draw_rope();

  circle(player_col * gridSize + gridSize / 2, player_row * gridSize + gridSize / 2, gridSize / 2 * 0.8);
}

function move(dr, dc) {
  player_row += dr;
  player_col += dc;

  var l = rope[rope.length - 2];
  if (l && l[0] == player_row * gridSize && l[1] == player_col * gridSize) {
    rope.pop();
  } else {
    rope.push([cg(player_col), cg(player_row)]);
  }

}

function press(key) {
  const dispatch = {
    'w': [move, [-1, 0]],
    'a': [move, [0, -1]],
    's': [move, [1, 0]],
    'd': [move, [0, 1]],
  };

  if (key in dispatch) {
    var d = dispatch[key];
    d[0](...d[1]);
  } else {
    console.log('unsupported key: ' + JSON.stringify(key));
  }


  render();
}

window.onload = function() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');


  window.addEventListener('keypress',  function(e) {
    press(e.key);
  });

  render();

}
